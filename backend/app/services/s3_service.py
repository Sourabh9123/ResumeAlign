import logging
from typing import Optional
import aioboto3
from botocore.exceptions import ClientError
from app.core.config import settings

logger = logging.getLogger(__name__)

class S3Service:
    """
    A modular async client for interacting with AWS S3.
    It manages file uploads and generating presigned URLs.
    """

    def __init__(self):
        self.session = aioboto3.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
        self.bucket_name = settings.AWS_S3_BUCKET

    async def upload_file(self, file_path: str, object_name: str) -> bool:
        """
        Upload a file to an S3 bucket asynchronously.

        :param file_path: File to upload
        :param object_name: S3 object name.
        :return: True if file was uploaded, else False
        """
        if not self.bucket_name or not settings.AWS_ACCESS_KEY_ID:
            logger.warning("S3 credentials or bucket not configured. Skipping upload.")
            return False

        try:
            async with self.session.client('s3') as s3_client:
                await s3_client.upload_file(file_path, self.bucket_name, object_name)
                logger.info(f"Successfully uploaded {file_path} to {self.bucket_name}/{object_name}")
                return True
        except ClientError as e:
            logger.error(f"Failed to upload file to S3: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error uploading to S3: {e}")
            return False

    async def generate_presigned_url(self, object_name: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL to share an S3 object asynchronously.

        :param object_name: S3 object name.
        :param expiration: Time in seconds for the presigned URL to remain valid.
        :return: Presigned URL as string. If error, returns None.
        """
        if not self.bucket_name or not settings.AWS_ACCESS_KEY_ID:
            logger.warning("S3 credentials or bucket not configured. Cannot generate presigned URL.")
            return None

        try:
            async with self.session.client('s3') as s3_client:
                response = await s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': self.bucket_name, 'Key': object_name},
                    ExpiresIn=expiration
                )
                return response
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error generating presigned URL: {e}")
            return None
