import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "rvc-service"))
import app.main as service


class ReservationTests(unittest.TestCase):
    def test_same_id_is_atomic_conflict_is_explicit_and_failed_upload_frees_slot(self):
        async def scenario():
            same = await asyncio.gather(*(
                service.reserve_conversion_job("same-request-id-0001", "parameters-a", "wav", "song")
                for _ in range(8)
            ))
            self.assertEqual(len({item[0] for item in same}), 1)
            self.assertEqual(sum(item[2] for item in same), 1)
            with self.assertRaises(service.RvcServiceError) as conflict:
                await service.reserve_conversion_job("same-request-id-0001", "parameters-b", "wav", "song")
            self.assertEqual(conflict.exception.status_code, 409)
            second = await service.reserve_conversion_job("other-request-id-0002", "parameters-a", "wav", "song")
            with self.assertRaises(service.RvcServiceError) as full:
                await service.reserve_conversion_job("third-request-id-0003", "parameters-a", "wav", "song")
            self.assertEqual(full.exception.status_code, 429)
            await service.release_preparing_job(second[0], "other-request-id-0002")
            third = await service.reserve_conversion_job("third-request-id-0003", "parameters-a", "wav", "song")
            self.assertTrue(third[2])
            service.persist_output_records()
            service.outputs = {}
            service.request_jobs = {}
            service.load_output_records()
            self.assertEqual(service.outputs[third[0]].state, "failed")
            recovered = await service.reserve_conversion_job("third-request-id-0003", "parameters-a", "wav", "song")
            self.assertTrue(recovered[2])
            self.assertNotEqual(recovered[0], third[0])

        original_root, original_outputs, original_jobs = service.OUTPUT_ROOT, service.outputs, service.request_jobs
        with tempfile.TemporaryDirectory() as root:
            try:
                service.OUTPUT_ROOT = Path(root)
                service.outputs = {}
                service.request_jobs = {}
                asyncio.run(scenario())
            finally:
                service.OUTPUT_ROOT = original_root
                service.outputs = original_outputs
                service.request_jobs = original_jobs


if __name__ == "__main__":
    unittest.main()
