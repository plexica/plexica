#!/usr/bin/env python3
"""
Validate documentation links in Markdown files.
Checks for:
- Broken relative file links
- Missing anchor references
- Consistency in documentation structure
"""

import re
import sys
from pathlib import Path
from typing import Set, Tuple, List, Dict

class LinkValidator:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.docs_dirs = [
            project_root / "specs",
            project_root / "docs", 
            project_root / "planning"
        ]
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.anchors: Dict[Path, Set[str]] = {}  # file -> set of anchors
        self.links: List[Tuple[Path, str]] = []  # (file, url)
        
    def extract_links(self) -> None:
        """Extract all markdown links from documentation files."""
        md_pattern = re.compile(r'\[.*?\]\((.*?)\)')
        
        for doc_dir in self.docs_dirs:
            if not doc_dir.exists():
                continue
                
            for md_file in doc_dir.rglob("*.md"):
                try:
                    content = md_file.read_text(encoding='utf-8')
                except Exception as e:
                    self.warnings.append(f"Could not read {md_file}: {e}")
                    continue
                
                # Extract anchors/headings
                heading_pattern = re.compile(r'^#+\s+(.+)$', re.MULTILINE)
                anchors = set()
                for heading in heading_pattern.finditer(content):
                    # Convert heading to anchor format
                    text = heading.group(1)
                    anchor = text.lower().replace(' ', '-').replace('&', 'and')
                    anchor = re.sub(r'[^\w\-]', '', anchor)
                    anchors.add(anchor)
                
                if anchors:
                    self.anchors[md_file] = anchors
                
                # Extract links
                for match in md_pattern.finditer(content):
                    url = match.group(1)
                    self.links.append((md_file, url))
    
    def validate_links(self) -> bool:
        """Validate all extracted links."""
        for source_file, url in self.links:
            # Skip external links
            if url.startswith('http'):
                continue
            
            # Skip anchor-only links (validate against same file)
            if url.startswith('#'):
                anchor = url[1:]
                if anchor not in self.anchors.get(source_file, set()):
                    self.warnings.append(
                        f"{source_file.relative_to(self.project_root)}: "
                        f"Anchor '#{anchor}' might not exist"
                    )
                continue
            
            # Parse file path and anchor
            if '#' in url:
                file_path, anchor = url.split('#', 1)
            else:
                file_path = url
                anchor = None
            
            # Resolve file path relative to source
            if file_path:
                target_file = (source_file.parent / file_path).resolve()
                
                # Check if file exists
                if not target_file.exists():
                    self.errors.append(
                        f"{source_file.relative_to(self.project_root)}: "
                        f"File not found: {file_path}"
                    )
                    continue
                
                # Check anchor if provided
                if anchor:
                    if target_file not in self.anchors:
                        # File might not be indexed, try to read it
                        if target_file.suffix == '.md':
                            try:
                                content = target_file.read_text(encoding='utf-8')
                                heading_pattern = re.compile(r'^#+\s+(.+)$', re.MULTILINE)
                                anchors = set()
                                for heading in heading_pattern.finditer(content):
                                    text = heading.group(1)
                                    a = text.lower().replace(' ', '-').replace('&', 'and')
                                    a = re.sub(r'[^\w\-]', '', a)
                                    anchors.add(a)
                                self.anchors[target_file] = anchors
                            except Exception as e:
                                self.warnings.append(f"Could not read {target_file}: {e}")
                    
                    if anchor not in self.anchors.get(target_file, set()):
                        self.warnings.append(
                            f"{source_file.relative_to(self.project_root)}: "
                            f"Anchor '#{anchor}' not found in {file_path}"
                        )
        
        return len(self.errors) == 0
    
    def report(self) -> int:
        """Print validation report and return exit code."""
        print("\n" + "="*70)
        print("DOCUMENTATION LINK VALIDATION REPORT")
        print("="*70 + "\n")
        
        print(f"📄 Scanned directories: {', '.join(str(d.relative_to(self.project_root)) for d in self.docs_dirs)}")
        print(f"🔗 Total links found: {len(self.links)}")
        print(f"📚 Files with anchors: {len(self.anchors)}")
        
        if self.errors:
            print(f"\n❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"   {error}")
        
        if self.warnings:
            print(f"\n⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings[:10]:  # Show first 10
                print(f"   {warning}")
            if len(self.warnings) > 10:
                print(f"   ... and {len(self.warnings) - 10} more")
        
        if not self.errors and not self.warnings:
            print("\n✅ All documentation links are valid!")
        
        print("\n" + "="*70 + "\n")
        
        return 1 if self.errors else 0

def main():
    project_root = Path(__file__).parent.parent.parent
    validator = LinkValidator(project_root)
    
    print("🔍 Extracting documentation links...")
    validator.extract_links()
    
    print("✓ Validating links...")
    validator.validate_links()
    
    return validator.report()

if __name__ == "__main__":
    sys.exit(main())
