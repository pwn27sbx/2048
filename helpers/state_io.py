#!/usr/bin/env python3
"""Bounded, symlink-safe state I/O for the 2048 panel.

Usage:
    python3 -I state_io.py read     # print <= 64 KiB of state to stdout
    python3 -I state_io.py write    # read new state JSON from stdin

The state path is derived here, never taken from argv:
    ${XDG_STATE_HOME:-$HOME/.local/state}/pwnsxb-2048/state.json

Security invariants (marketplace review requirements):
  * XDG_STATE_HOME is honoured only when it is an absolute path.
  * The state directory is opened with O_DIRECTORY | O_NOFOLLOW and must be
    a directory owned by the current uid.
  * state.json is opened relative to that directory fd with O_NOFOLLOW, must
    be a regular file owned by the current uid, and is read at most
    65536 + 1 bytes with O_NONBLOCK (never blocks on a FIFO).
  * Writes are atomic owner-only replacements: a 0600 temp file created with
    O_EXCL | O_NOFOLLOW inside the state dir, fsynced, os.replace()d over
    state.json, then the directory is fsynced.
  * The helper performs no network access and never waits.
"""

from __future__ import annotations

import json
import os
import secrets
import stat
import sys

MAX_BYTES = 65536
READ_LIMIT = MAX_BYTES + 1
STATE_FILE = "state.json"


def state_dir() -> str:
    """Return the derived state directory (never a symlinked path we follow)."""
    xdg = os.environ.get("XDG_STATE_HOME")
    if xdg and os.path.isabs(xdg):
        base = xdg
    else:
        home = os.environ.get("HOME") or os.path.expanduser("~")
        base = os.path.join(home, ".local", "state")
    return os.path.join(base, "pwnsxb-2048")


def _open_state_dir(path: str) -> int:
    """Open `path` as a directory fd, rejecting symlinks and foreign owners."""
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
            raise OSError("state directory is not an owned directory")
    except OSError:
        os.close(fd)
        raise
    return fd


def _read_all_bounded(stream, limit: int) -> bytes:
    """Read at most `limit` bytes; a longer stream simply yields `limit` bytes."""
    chunks = []
    remaining = limit
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def cmd_read() -> int:
    try:
        dir_fd = _open_state_dir(state_dir())
    except FileNotFoundError:
        return 0  # no state directory yet -> fresh game
    except OSError:
        return 1

    try:
        try:
            file_fd = os.open(
                STATE_FILE,
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=dir_fd,
            )
        except FileNotFoundError:
            return 0  # no state file yet -> fresh game
        except OSError:
            return 1

        try:
            st = os.fstat(file_fd)
            if not stat.S_ISREG(st.st_mode) or st.st_uid != os.getuid():
                return 1
            data = _read_all_bounded(os.fdopen(file_fd, "rb", closefd=False), READ_LIMIT)
        finally:
            os.close(file_fd)

        if len(data) > MAX_BYTES:
            return 1
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return 1

        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        return 0
    finally:
        os.close(dir_fd)


def cmd_write() -> int:
    data = _read_all_bounded(sys.stdin.buffer, READ_LIMIT)
    if len(data) > MAX_BYTES:
        return 1
    try:
        json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return 1

    directory = state_dir()
    try:
        os.makedirs(directory, mode=0o700, exist_ok=True)
    except OSError:
        return 1

    try:
        dir_fd = _open_state_dir(directory)
    except OSError:
        return 1

    tmp_name = ".{}.tmp.{}.{}".format(
        STATE_FILE, os.getpid(), secrets.token_hex(8)
    )
    tmp_fd = -1
    try:
        tmp_fd = os.open(
            tmp_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=dir_fd,
        )
        os.fchmod(tmp_fd, 0o600)
        written = 0
        view = memoryview(data)
        while written < len(data):
            written += os.write(tmp_fd, view[written:])
        os.fsync(tmp_fd)
        os.close(tmp_fd)
        tmp_fd = -1
        os.replace(tmp_name, STATE_FILE, src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
        os.fsync(dir_fd)
        return 0
    except OSError:
        if tmp_fd >= 0:
            try:
                os.close(tmp_fd)
            except OSError:
                pass
        try:
            os.unlink(tmp_name, dir_fd=dir_fd)
        except OSError:
            pass
        return 1
    finally:
        os.close(dir_fd)


def main(argv) -> int:
    if len(argv) != 2 or argv[1] not in ("read", "write"):
        sys.stderr.write("usage: state_io.py read|write\n")
        return 2
    if argv[1] == "read":
        return cmd_read()
    return cmd_write()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
