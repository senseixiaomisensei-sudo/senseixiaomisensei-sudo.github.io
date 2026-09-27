"""Build reversible candidate ONNX resources; never activate or publish them."""
import argparse
import hashlib
import json
from pathlib import Path
import onnx


def externalize_excitation(graph):
    parents={output:node for node in graph.graph.node for output in node.output}
    weights={tensor.name for tensor in graph.graph.initializer
             if tensor.name.endswith('dec.m_source.l_linear.weight')}
    source=[]
    for node in graph.graph.node:
        if node.op_type=='MatMul' and len(node.input)==2:
            weight=parents.get(node.input[1])
            if weight and weight.op_type=='Transpose' and weight.input[0] in weights:
                source.append(node)
    posts=[node for node in graph.graph.node if node.op_type=='Conv'
           and any(name.endswith('dec.conv_post.weight') for name in node.input)]
    if len(source)!=1 or len(posts)!=1:
        raise ValueError('Unrecognized decoder: no automatic graph rewrite')
    activation=parents[posts[0].input[0]]
    if activation.op_type!='LeakyRelu':raise ValueError('Unexpected decoder activation')
    alpha=next(value for value in activation.attribute if value.name=='alpha')
    previous_alpha=alpha.f;alpha.f=.01
    source[0].input[0]='source_excitation'
    graph.graph.input.append(onnx.helper.make_tensor_value_info(
        'source_excitation',onnx.TensorProto.FLOAT,[1,'audio_len',1]))
    onnx.checker.check_model(graph)
    return dict(previousFinalSlope=previous_alpha,finalSlope=.01,
                excitation='explicit float32 samples computed from a float64 phase clock')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('output',type=Path);a=p.parse_args()
    a.output=a.output.resolve();a.output.mkdir(parents=True,exist_ok=True)
    site=Path(__file__).resolve().parents[1]
    catalog=json.loads((site/'assets/rvc-models.json').read_text(encoding='utf8'))['models']
    rows=[]
    for entry in catalog:
        content=b''.join((site/name).read_bytes() for name in entry['chunks'])
        original=hashlib.sha256(content).hexdigest()
        if entry.get('sha256'):assert original==entry['sha256']
        graph=onnx.load_from_string(content)
        change=externalize_excitation(graph);candidate=graph.SerializeToString()
        revision=hashlib.sha256(candidate).hexdigest()
        folder=a.output/entry['id']/revision[:16];folder.mkdir(parents=True,exist_ok=True)
        (folder/'model.onnx').write_bytes(candidate)
        rows.append(dict(characterId=entry['id'],originalSha256=original,candidateSha256=revision,
            checkpointSha256=entry.get('checkpointSha256'),indexSha256=entry.get('indexSha256'),
            candidatePath=str(folder/'model.onnx'),bytes=len(candidate),change=change,
            originalResourceRetained=True,activeCatalogChanged=False,qualityListening='unverified'))
        (a.output/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(dict(candidates=len(rows),activeCatalogChanged=False)),flush=True)
