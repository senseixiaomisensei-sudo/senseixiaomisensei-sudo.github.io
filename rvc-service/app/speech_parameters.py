"""Native Seed-VC sampling controls; these are not reasoning levels."""
import re

DEFAULT_STEPS = 100
MIN_STEPS = 1
MAX_STEPS = 200
STEP_PRESETS = (30, 60, 100, 200)


def validate_speech_steps(value=DEFAULT_STEPS):
    if not re.fullmatch(r'(?:[1-9]\d?|1\d\d|200)', str(value)):
        raise ValueError('Speech sampling steps must be an integer from 1 to 200')
    return int(value)
