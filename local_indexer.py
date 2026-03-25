#!/usr/bin/env python3
"""
Local Indexer for University Class Lists - Fast Edition

Downloads class list Excel files and builds a search index.
Optimized for speed with per-file parallelism.
"""

import os
import json
import re
import time
from datetime import datetime, timezone
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from tqdm import tqdm
import argparse
import sys
import threading
from typing import Optional, List, Dict, Tuple

# --- CONFIGURATION ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLASSLISTS_DIR = os.path.join(SCRIPT_DIR, 'classlists_temp')
MANIFEST_FILE = os.path.join(CLASSLISTS_DIR, 'manifest.json')
OUTPUT_INDEX_FILE = os.path.join(SCRIPT_DIR, 'search_index_sp26.json')
CLASS_LIST_URL = "https://chreg.eng.cu.edu.eg/ClassList.aspx?s=1"

DEFAULT_WORKERS = 15
REQUEST_TIMEOUT = 30
MAX_RETRIES = 2

# Thread-safe counters
_lock = threading.Lock()
_stats = {'success': 0, 'failed': 0, 'skipped': 0}


def create_session() -> requests.Session:
    """Create session with connection pooling."""
    session = requests.Session()
    adapter = HTTPAdapter(pool_connections=30, pool_maxsize=30)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    })
    return session


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).replace(' ', '_')


def get_course_identifier(course: dict) -> str:
    return f"{course['Code']}_{course['Group']}_{course['UniqueID']}"


def extract_postback_target(href: str) -> tuple:
    match = re.search(r"__doPostBack\('([^']+)','([^']*)'\)", href)
    return (match.group(1), match.group(2)) if match else (None, None)


def clean_directory(directory: str) -> None:
    if os.path.exists(directory):
        print(f"🧹 Cleaning {directory}...", flush=True)
        for f in os.listdir(directory):
            fp = os.path.join(directory, f)
            if os.path.isfile(fp):
                os.remove(fp)
    else:
        os.makedirs(directory, exist_ok=True)
    print("   ✓ Done", flush=True)


def fetch_course_list() -> Optional[List[dict]]:
    """Fetch course list from website."""
    print("\n📋 [1/3] Fetching course list...", flush=True)
    
    session = create_session()
    try:
        resp = session.get(CLASS_LIST_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        table = soup.find('table', id='GridView1')
        if not table:
            print("   ❌ Table not found!", flush=True)
            return None
        
        courses = []
        for i, row in enumerate(table.find_all('tr')[1:]):
            cells = row.find_all('td')
            if len(cells) >= 8:
                link = cells[8].find('a') if len(cells) > 8 else None
                if link and link.has_attr('href'):
                    target, arg = extract_postback_target(link['href'])
                    uid_match = re.search(r'ctl(\d+)', target) if target else None
                    uid = uid_match.group(1) if uid_match else f"i{i}"
                    
                    code = cells[0].text.strip()
                    group = cells[7].text.strip() if len(cells) > 7 else ""
                    
                    courses.append({
                        "Code": code,
                        "Name": cells[1].text.strip(),
                        "Type": cells[3].text.strip(),
                        "Day": cells[4].text.strip(),
                        "Time": f"{cells[5].text.strip()} - {cells[6].text.strip()}",
                        "Group": group,
                        "Location": cells[2].text.strip(),
                        "UniqueID": uid,
                        "Link": CLASS_LIST_URL,
                        "EventTarget": target,
                        "EventArgument": arg,
                        "LocalFile": f"{sanitize_filename(f'{code}_{group}_{uid}')}.xlsx"
                    })
        
        print(f"   ✓ Found {len(courses)} courses", flush=True)
        return courses
    except Exception as e:
        print(f"   ❌ Error: {e}", flush=True)
        return None
    finally:
        session.close()


def download_file(course: dict) -> Tuple[bool, str]:
    """Download a single file. Returns (success, error_msg)."""
    global _stats
    
    target = course.get('EventTarget')
    if not target:
        return False, "No target"
    
    filepath = os.path.join(CLASSLISTS_DIR, course['LocalFile'])
    
    # Skip existing
    if os.path.exists(filepath):
        with _lock:
            _stats['skipped'] += 1
        return True, None
    
    session = create_session()
    
    for attempt in range(MAX_RETRIES):
        try:
            # Get fresh ViewState for each file (reliable but slower)
            page = session.get(CLASS_LIST_URL, timeout=REQUEST_TIMEOUT)
            soup = BeautifulSoup(page.content, 'html.parser')
            
            vs = soup.find('input', {'id': '__VIEWSTATE'})
            vsg = soup.find('input', {'id': '__VIEWSTATEGENERATOR'})
            ev = soup.find('input', {'id': '__EVENTVALIDATION'})
            
            if not vs or not ev:
                continue
            
            data = {
                '__EVENTTARGET': target,
                '__EVENTARGUMENT': course.get('EventArgument', ''),
                '__VIEWSTATE': vs['value'],
                '__VIEWSTATEGENERATOR': vsg['value'] if vsg else '',
                '__EVENTVALIDATION': ev['value'],
                '__VIEWSTATEENCRYPTED': '',
            }
            
            resp = session.post(CLASS_LIST_URL, data=data, 
                              headers={'Referer': CLASS_LIST_URL}, 
                              timeout=REQUEST_TIMEOUT)
            
            # Check for Excel file
            if resp.status_code == 200 and resp.content[:4] == b'PK\x03\x04':
                with open(filepath, 'wb') as f:
                    f.write(resp.content)
                with _lock:
                    _stats['success'] += 1
                session.close()
                return True, None
                
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                session.close()
                with _lock:
                    _stats['failed'] += 1
                return False, str(e)
    
    session.close()
    with _lock:
        _stats['failed'] += 1
    return False, "Max retries"


def download_all(courses: List[dict], workers: int) -> None:
    """Download all files in parallel."""
    global _stats
    _stats = {'success': 0, 'failed': 0, 'skipped': 0}
    
    print(f"\n⬇️  [2/3] Downloading {len(courses)} files ({workers} workers)...", flush=True)
    os.makedirs(CLASSLISTS_DIR, exist_ok=True)
    
    failed = []
    
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(download_file, c): c for c in courses}
        
        with tqdm(total=len(courses), desc="   Progress", unit="file") as pbar:
            for future in as_completed(futures):
                course = futures[future]
                success, error = future.result()
                
                if not success:
                    failed.append(f"{course['Code']} ({error})")
                
                pbar.update(1)
                pbar.set_postfix(ok=_stats['success'], fail=_stats['failed'], skip=_stats['skipped'])
    
    print(f"\n   📊 Results: ✓{_stats['success']} ⏭{_stats['skipped']} ✗{_stats['failed']}", flush=True)
    
    # Save manifest
    with open(MANIFEST_FILE, 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)


def process_course(course: dict) -> Optional[tuple]:
    """Process single course for indexing."""
    cid = get_course_identifier(course)
    fp = os.path.join(CLASSLISTS_DIR, course['LocalFile'])
    
    if not os.path.exists(fp):
        return None
    
    cdata = {k: v for k, v in course.items() if k not in ['EventTarget', 'EventArgument']}
    search_idx = {}
    students = {}
    student_idx = {}
    course_students = []
    
    try:
        df = pd.read_excel(fp, header=None, engine='openpyxl')
        
        for cell in df.values.flatten():
            s = str(cell).strip()
            if s and s != 'nan':
                if s not in search_idx:
                    search_idx[s] = []
                search_idx[s].append(cid)
        
        if len(df) > 1:
            for row in df.values[1:]:
                if len(row) > 3:
                    code = str(row[1]).strip()
                    ar = str(row[2]).strip()
                    en = str(row[3]).strip()
                    
                    if code and code != 'nan':
                        if code not in students:
                            students[code] = {"Code": code, "NameAr": ar if ar != 'nan' else "", "NameEn": en if en != 'nan' else ""}
                        
                        for t in [code, ar, en]:
                            if t and t != 'nan':
                                if t not in student_idx:
                                    student_idx[t] = []
                                student_idx[t].append(code)
                        
                        if code not in course_students:
                            course_students.append(code)
        
        return (cid, cdata, search_idx, students, student_idx, course_students)
    except:
        return None


def build_index(workers: int = None) -> bool:
    """Build search index."""
    workers = workers or (os.cpu_count() or 4)
    print(f"\n🔍 [3/3] Building index ({workers} workers)...", flush=True)
    
    if not os.path.exists(MANIFEST_FILE):
        print("   ❌ No manifest!", flush=True)
        return False
    
    with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
        courses = json.load(f)
    
    existing = sum(1 for c in courses if os.path.exists(os.path.join(CLASSLISTS_DIR, c['LocalFile'])))
    print(f"   → {existing}/{len(courses)} files available", flush=True)
    
    courses_map = {}
    search_index = {}
    students_map = {}
    student_search = {}
    course_students = {}
    
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(process_course, c): c for c in courses}
        
        for future in tqdm(as_completed(futures), total=len(courses), desc="   Indexing"):
            r = future.result()
            if r:
                cid, cdata, si, st, sti, cs = r
                courses_map[cid] = cdata
                course_students[cid] = cs
                
                for t, ids in si.items():
                    if t not in search_index:
                        search_index[t] = []
                    search_index[t].extend(ids)
                
                students_map.update(st)
                
                for t, codes in sti.items():
                    if t not in student_search:
                        student_search[t] = set()
                    student_search[t].update(codes)
    
    if not courses_map:
        print("   ❌ No files processed!", flush=True)
        return False
    
    # Dedupe
    for t in search_index:
        search_index[t] = list(set(search_index[t]))
    for t in student_search:
        student_search[t] = list(student_search[t])
    
    final = {
        "metadata": {
            "indexed_at": datetime.now(timezone.utc).isoformat(),
            "total_courses": len(courses_map),
            "total_students": len(students_map)
        },
        "courses": courses_map,
        "index": search_index,
        "students": students_map,
        "student_index": student_search,
        "course_students": course_students
    }
    
    with open(OUTPUT_INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(final, f, separators=(',', ':'))
    
    size = os.path.getsize(OUTPUT_INDEX_FILE) / (1024 * 1024)
    print(f"\n   ✓ {len(courses_map)} courses, {len(students_map)} students ({size:.1f}MB)", flush=True)
    return True


def main():
    parser = argparse.ArgumentParser(description="Download and index class lists")
    parser.add_argument('--clean', action='store_true', help="Clean old files first")
    parser.add_argument('--index-only', action='store_true', help="Only rebuild index")
    parser.add_argument('--limit', type=int, default=0, help="Limit courses")
    parser.add_argument('--workers', type=int, default=DEFAULT_WORKERS, help="Workers")
    args = parser.parse_args()
    
    print("=" * 50)
    print("🎓 Class List Indexer")
    print("=" * 50)
    
    start = time.time()
    
    if args.index_only:
        build_index()
    else:
        if args.clean:
            clean_directory(CLASSLISTS_DIR)
        
        courses = fetch_course_list()
        if not courses:
            sys.exit(1)
        
        if args.limit > 0:
            print(f"⚠️  Limiting to {args.limit} courses", flush=True)
            courses = courses[:args.limit]
        
        download_all(courses, args.workers)
        build_index()
    
    elapsed = time.time() - start
    print(f"\n✅ Done in {int(elapsed//60)}m {int(elapsed%60)}s")


if __name__ == '__main__':
    main()