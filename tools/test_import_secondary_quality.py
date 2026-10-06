import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('secondary', Path(__file__).with_name('import-secondary-quality.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportTests(unittest.TestCase):
    def test_dated_public_snapshot(self):
        store = Path(__file__).resolve().parents[1] / 'outputs' / 'detail-preview'
        if not (store / 'raw' / 'secondary-provinces-2026-10-05.html').exists():
            self.skipTest('Local downloaded fixture not present')
        snapshot = module.build_snapshot(store)
        self.assertEqual(snapshot['day'], '2026-10-05')
        self.assertEqual(snapshot['totalScore'], 54.64)
        self.assertEqual(len(snapshot['departments']), 142)
        self.assertEqual(len({d['code'] for d in snapshot['departments']}), 142)
        self.assertTrue(all(not g['metrics'] for g in snapshot['groups']))
        self.assertTrue(all('groupDetails' not in d for d in snapshot['departments']))
        self.assertFalse(snapshot['source']['captureTimeKnown'])

    def test_missing_score_is_not_zero(self):
        with self.assertRaises(ValueError):
            module.number({'text': '—'})

    def test_wrong_row_date_rejected(self):
        with self.assertRaises(ValueError):
            module.identifier({'href': '/unit/example?query_date=2026-10-06'}, '2026-10-05')

    def test_inconsistent_source_is_flagged_not_corrected(self):
        self.assertEqual(module.score_consistency(60, [{'score': 59}]), 1)
        self.assertIsNone(module.score_consistency(60, [{'score': 60.02}]))
        with self.assertRaises(ValueError):
            module.score_consistency(101, [])


if __name__ == '__main__':
    unittest.main()
