"""Import a public, dated score table into the local preview only."""
import json
import argparse
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, parse_qs


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = {}
        self.table = None
        self.row = None
        self.cell = None
        self.selected_day = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input' and attrs.get('name') == 'query_date':
            self.selected_day = attrs.get('value')
        if tag == 'table':
            self.table = attrs.get('id')
            self.tables[self.table] = []
        elif self.table and tag == 'tr':
            self.row = []
        elif self.row is not None and tag == 'td':
            self.cell = {'text': '', 'href': None}
        elif self.cell is not None and tag == 'a':
            self.cell['href'] = attrs.get('href')

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['text'] += data

    def handle_endtag(self, tag):
        if tag == 'td' and self.cell is not None:
            self.cell['text'] = ' '.join(self.cell['text'].split())
            self.row.append(self.cell)
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.row:
                self.tables[self.table].append(self.row)
            self.row = None
        elif tag == 'table':
            self.table = None


def parse(path, day):
    parser = Tables()
    parser.feed(path.read_text(encoding='utf-8-sig'))
    if parser.selected_day != day:
        raise ValueError('The source did not return the requested date')
    return parser.tables


def number(cell):
    if not re.fullmatch(r'\d+(?:\.\d+)?', cell['text']):
        raise ValueError(f"Missing or invalid score: {cell['text']}")
    return float(cell['text'])


def identifier(cell, day):
    link = urlparse(cell['href'] or '')
    if parse_qs(link.query).get('query_date') != [day]:
        raise ValueError('A row has a different date')
    return link.path.rsplit('/', 1)[-1]


def score_consistency(total, groups):
    if not 0 <= total <= 100:
        raise ValueError('Total score outside scale')
    difference = round(total - sum(g['score'] for g in groups), 2)
    return difference if abs(difference) > .061 else None


def build_snapshot(store, day='2026-10-05'):
    reference = json.loads((store / '2026-10-06.json').read_text(encoding='utf-8-sig'))
    raw = store / 'raw'
    cities = parse(raw / f'secondary-provinces-{day}.html', day)['provincesTable']
    city = next(r for r in cities if identifier(r[1], day) == reference['department']['id'])
    tables = parse(raw / f'secondary-hanoi-{day}.html', day)
    by_id = {d['id']: d for d in reference['departments']}
    groups = []
    for i, g in enumerate(reference['groups']):
        score = number(city[4 + i])
        if not 0 <= score <= g['maxScore']:
            raise ValueError('Group score is outside its scale')
        groups.append(dict(code=g['code'], name=g['name'], score=score,
                           maxScore=g['maxScore'], ratio=score / g['maxScore'] * 100, metrics=[]))
    departments = []
    seen = set()
    for table, kind, count in [('agencyTable', 'AGENCY', 16), ('communeTable', 'COMMUNE', 126)]:
        if len(tables[table]) != count:
            raise ValueError('Unexpected unit coverage')
        for row in tables[table]:
            uid = identifier(row[1], day)
            ref = by_id.get(uid)
            if ref is None or ref['type'] != kind or uid in seen:
                raise ValueError('Unmatched, duplicate or changed unit identifier')
            seen.add(uid)
            scores = {}
            for i, g in enumerate(groups):
                score = number(row[4 + i])
                if not 0 <= score <= g['maxScore']:
                    raise ValueError('Unit group score outside scale')
                scores[g['code']] = {'score': score, 'maxScore': g['maxScore']}
            total = number(row[2])
            discrepancy = score_consistency(total, scores.values())
            departments.append(dict(id=uid, code=ref['code'], name=ref['name'],
                                    sourceName=row[1]['text'], type=kind, score=total, groupScores=scores,
                                    **({'sourceScoreDiscrepancy': discrepancy} if discrepancy is not None else {})))
    total = number(city[2])
    city_discrepancy = score_consistency(total, groups)
    mismatched = sum('sourceScoreDiscrepancy' in d for d in departments)
    consistency_note = f' Có {mismatched} đơn vị có điểm tổng lệch tổng 6 nhóm; giữ nguyên điểm nguồn, chưa xác minh nguyên nhân.' if mismatched else ''
    if city_discrepancy is not None:
        consistency_note += f' Điểm tổng thành phố lệch tổng 6 nhóm {city_discrepancy:+.2f} điểm.'
    now = datetime.now(timezone.utc).isoformat()
    return dict(day=day, capturedAt=now, importedAt=now, period=reference['period'],
                department=reference['department'], totalScore=total, totalMaxScore=100,
                rank=number(city[0]), provinceCount=len(cities), groups=groups, departments=departments,
                source=dict(name='kq766.anhminh.com.vn',
                            url=f"https://kq766.anhminh.com.vn/province/{reference['department']['id']}?query_date={day}",
                            scope='public-group-scores', captureTimeKnown=False,
                            inconsistentUnitCount=mismatched, cityScoreDiscrepancy=city_discrepancy,
                            note='Bản điểm công khai theo ngày của nguồn phụ; chưa xác minh thời điểm chốt và cách tổng hợp trùng với nguồn DVCQG. Chỉ có điểm tổng và 6 nhóm, không có chi tiết hồ sơ.' + consistency_note))


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--day', default='2026-10-05')
    args.add_argument('--store', type=Path, default=Path(__file__).resolve().parents[1] / 'outputs' / 'detail-preview')
    options = args.parse_args()
    datetime.strptime(options.day, '%Y-%m-%d')
    store = options.store.resolve()
    snapshot = build_snapshot(store, options.day)
    target = store / (snapshot['day'] + '.json')
    if target.exists():
        raise SystemExit('Refusing to overwrite an existing snapshot')
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(target)
    print(json.dumps(dict(day=snapshot['day'], total=snapshot['totalScore'], units=len(snapshot['departments'])), ensure_ascii=False))
