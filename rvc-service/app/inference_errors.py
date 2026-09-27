"""Keep the first failing inference stage instead of relabelling it as F0."""


class InferenceStageError(RuntimeError):
    def __init__(self, stage: str, message: str):
        self.stage = stage
        super().__init__(f'{stage}: {message}')


class PitchExtractionError(InferenceStageError):
    def __init__(self, message: str):
        super().__init__('f0-extraction', message)
