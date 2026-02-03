#!/usr/bin/env python3
"""
Pre-commit hook to validate documentation metadata.

Checks that all markdown documentation files have required metadata:
- Last Updated date
- Status
- Owner
- Document Type

Runs on staged markdown files in docs/, specs/, and planning/ directories.
"""

import re
import sys
import subprocess
from pathlib import Path
from datetime import datetime

class DocMetadataValidator:
    """Validate documentation metadata requirements."""
    
    # Required metadata fields
    REQUIRED_FIELDS = {
        'Last Updated': r'\*\*Last Updated\*\*:\s*\d{4}-\d{2}-\d{2}',
        'Status': r'\*\*Status\*\*:\s*.+',
        'Owner': r'\*\*Owner\*\*:\s*.+',
        'Document Type': r'\*\*Document Type\*\*:\s*.+',
    }
    
    # Directories that require metadata
    DOCS_DIRS = {'specs', 'docs', 'planning', '.github/docs'}
    
    # Excluded files/directories
    EXCLUDE_PATTERNS = {
        'README.md',  # Index files don't require full metadata
        '__pycache__',
        '.git',
        'node_modules',
    }
    
    def __init__(self):
        self.errors = []
        self.warnings = []
        
    def should_check_file(self, filepath: Path) -> bool:
        """Determine if a file should be checked."""
        # Check if it's a markdown file
        if filepath.suffix != '.md':
            return False
        
        # Check if it's in a docs directory
        if not any(part in self.DOCS_DIRS for part in filepath.parts):
            return False
        
        # Skip excluded files
        if any(pattern in str(filepath) for pattern in self.EXCLUDE_PATTERNS):
            return False
        
        return True
    
    def validate_file(self, filepath: Path) -> bool:
        """Validate a single markdown file."""
        try:
            content = filepath.read_text(encoding='utf-8')
        except Exception as e:
            self.errors.append(f"Could not read {filepath}: {e}")
            return False
        
        # Extract metadata from file
        missing_fields = []
        found_fields = {}
        
        for field_name, pattern in self.REQUIRED_FIELDS.items():
            match = re.search(pattern, content, re.MULTILINE)
            if match:
                found_fields[field_name] = match.group(0)
            else:
                missing_fields.append(field_name)
        
        # Check for issues
        if missing_fields:
            self.errors.append(
                f"{filepath.relative_to(Path.cwd())}: "
                f"Missing metadata: {', '.join(missing_fields)}"
            )
            return False
        
        # Additional validation: Check Last Updated is recent
        if 'Last Updated' in found_fields:
            date_match = re.search(r'\d{4}-\d{2}-\d{2}', found_fields['Last Updated'])
            if date_match:
                date_str = date_match.group(0)
                try:
                    doc_date = datetime.strptime(date_str, '%Y-%m-%d')
                    current_date = datetime.now()
                    days_old = (current_date - doc_date).days
                    
                    if days_old > 180:  # 6 months
                        self.warnings.append(
                            f"{filepath.relative_to(Path.cwd())}: "
                            f"Last Updated is {days_old} days old. Consider updating."
                        )
                except ValueError:
                    pass
        
        # Check Status has valid value
        if 'Status' in found_fields:
            valid_statuses = ['Complete', 'In Progress', 'Planned', 'Deprecated', 'Archived', 'Needs Update']
            status_value = found_fields['Status']
            if not any(s in status_value for s in valid_statuses):
                self.warnings.append(
                    f"{filepath.relative_to(Path.cwd())}: "
                    f"Status '{status_value}' should be one of: {', '.join(valid_statuses)}"
                )
        
        return True
    
    def get_staged_files(self) -> list:
        """Get list of staged markdown files."""
        try:
            result = subprocess.run(
                ['git', 'diff', '--cached', '--name-only'],
                capture_output=True,
                text=True,
                check=True
            )
            files = result.stdout.strip().split('\n')
            return [Path(f) for f in files if f]
        except subprocess.CalledProcessError:
            return []
    
    def run(self) -> int:
        """Run validation on staged files."""
        staged_files = self.get_staged_files()
        
        if not staged_files:
            print("No staged files to validate")
            return 0
        
        # Filter to documentation files
        doc_files = [f for f in staged_files if self.should_check_file(f)]
        
        if not doc_files:
            return 0  # No docs to check
        
        print("🔍 Validating documentation metadata...")
        print(f"Checking {len(doc_files)} documentation file(s)\n")
        
        for doc_file in doc_files:
            self.validate_file(doc_file)
        
        # Report results
        if self.errors:
            print("❌ METADATA VALIDATION FAILED")
            print("\nErrors:")
            for error in self.errors:
                print(f"  {error}")
            print()
            return 1  # Fail the commit
        
        if self.warnings:
            print("⚠️  Warnings (non-blocking):")
            for warning in self.warnings:
                print(f"  {warning}")
            print()
        
        if not self.errors:
            print("✅ All documentation metadata is valid!")
            print()
        
        return 0

def main():
    validator = DocMetadataValidator()
    return validator.run()

if __name__ == "__main__":
    sys.exit(main())
