import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app.content_encoder import checkpoint_encoder_contract


class ContentEncoderTests(unittest.TestCase):
    def test_same_768_dimensions_do_not_discard_japanese_contract(self):
        contract = checkpoint_encoder_contract({'version': 'v2',
            'embedder_name': 'hubert-base-japanese', 'embedder_output_layer': 12})
        self.assertEqual(contract.name, 'hubert-base-japanese')
        self.assertEqual(contract.feature_dimension, 768)
        self.assertEqual(contract.declaration, 'checkpoint')

    def test_legacy_versions_keep_their_existing_feature_contract(self):
        for version, layer, dimension in [('v1', 9, 256), ('v2', 12, 768)]:
            contract = checkpoint_encoder_contract({'version': version})
            self.assertEqual((contract.name, contract.output_layer, contract.feature_dimension),
                             ('hubert_base', layer, dimension))

    def test_unknown_encoder_or_wrong_layer_fails_instead_of_silent_fallback(self):
        for metadata in [
            {'version': 'v2', 'embedder_name': 'another-768-dimensional-encoder'},
            {'version': 'v2', 'embedder_output_layer': 9},
            {'version': 'v2', 'embedder_output_layer': True},
            {'version': 'v1', 'embedder_name': 'hubert-base-japanese'},
        ]:
            with self.assertRaises(ValueError): checkpoint_encoder_contract(metadata)
