"""
Safe ZIP extraction.

Uploaded ZIPs are untrusted input. A malicious ZIP can contain entries with
paths like "../../etc/passwd" (the "zip-slip" attack) that escape the
intended extraction directory when extracted naively. This module refuses
any entry that would land outside the target directory, and enforces basic
size/file-count limits so a single upload can't exhaust disk space.
"""
import zipfile
from pathlib import Path

from app.config import MAX_FILES_IN_ZIP, MAX_UPLOAD_SIZE_MB


class UnsafeZipError(Exception):
    pass


def _is_within_directory(directory: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(directory.resolve())
        return True
    except ValueError:
        return False


def safe_extract_zip(zip_path: Path, dest_dir: Path) -> Path:
    """
    Extracts zip_path into dest_dir, refusing any entry that would escape
    dest_dir. Returns the path to the extracted project root.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        members = zf.infolist()

        if len(members) > MAX_FILES_IN_ZIP:
            raise UnsafeZipError(
                f"ZIP contains {len(members)} entries, which exceeds the "
                f"{MAX_FILES_IN_ZIP}-file limit for this MVP."
            )

        total_uncompressed = sum(m.file_size for m in members)
        if total_uncompressed > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise UnsafeZipError(
                f"Uncompressed project exceeds the {MAX_UPLOAD_SIZE_MB}MB limit."
            )

        for member in members:
            member_path = dest_dir / member.filename
            if not _is_within_directory(dest_dir, member_path):
                raise UnsafeZipError(
                    f"Refusing to extract unsafe path in ZIP: {member.filename}"
                )

        zf.extractall(dest_dir)

    return dest_dir
