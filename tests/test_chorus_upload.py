"""Failed multipart preparation must never strand a GPU queue reservation."""
import sys
import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI, UploadFile
from starlette.datastructures import Headers

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.chorus_api import install_chorus_routes

class ServiceError(Exception):
    def __init__(self,status,code):self.status=status;self.code=code

class ChorusUploadTest(unittest.TestCase):
    def core(self,root):
        return SimpleNamespace(OUTPUT_ROOT=root,RvcServiceError=ServiceError,
            ensure_authorized=lambda request:None,active_training_job_id=None,
            valid_request_id=lambda value:True,PIPELINE_REVISION='test',
            cleanup_expired_outputs=AsyncMock(),reserve_conversion_job=AsyncMock(),
            release_preparing_job=AsyncMock(),write_upload=AsyncMock(),
            re_full_uuid=lambda value:True)

    def submit(self,core,name='voice.mp3',mime='audio/mpeg'):
        app=FastAPI()
        install_chorus_routes(app,core)
        endpoint=next(route.endpoint for route in app.routes if route.path=='/v1/chorus/analyze')
        upload=UploadFile(io.BytesIO(b'audio'),filename=name,headers=Headers({'content-type':mime}))
        return asyncio.run(endpoint(None,upload,'auto','mix','',False))

    def test_invalid_extension_rejected_without_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            core=self.core(Path(temporary))
            def reject(upload):raise ServiceError(400,'RVC_INVALID_AUDIO')
            core.safe_extension=reject
            with patch('app.chorus_api.chorus_status',return_value={'ready':True}),self.assertRaises(ServiceError) as result:
                self.submit(core,'bad.exe','application/octet-stream')
            self.assertEqual(result.exception.status,400)
            core.reserve_conversion_job.assert_not_awaited()

    def test_directory_failure_releases_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);core=self.core(root);core.safe_extension=lambda upload:'mp3'
            job='12345678-abcd-abcd-abcd-123456789abc'
            core.reserve_conversion_job.return_value=(job,SimpleNamespace(),True)
            target=root/'chorus';target.mkdir();(target/job).write_text('blocking file')
            with patch('app.chorus_api.chorus_status',return_value={'ready':True}),self.assertRaises(FileExistsError):
                self.submit(core)
            core.release_preparing_job.assert_awaited_once_with(job,'')

    def test_failed_upload_releases_reservation(self):
        with tempfile.TemporaryDirectory() as temporary:
            core=self.core(Path(temporary));core.safe_extension=lambda upload:'mp3'
            job='12345678-abcd-abcd-abcd-123456789abc'
            core.reserve_conversion_job.return_value=(job,SimpleNamespace(),True)
            core.write_upload.side_effect=ServiceError(413,'RVC_AUDIO_TOO_LARGE')
            with patch('app.chorus_api.chorus_status',return_value={'ready':True}),self.assertRaises(ServiceError) as result:
                self.submit(core)
            self.assertEqual(result.exception.status,413)
            core.release_preparing_job.assert_awaited_once_with(job,'')

if __name__=='__main__':unittest.main()
