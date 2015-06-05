import {DotProto} from 'protobufjs';

export function parseProtoFile(protoString: string): any {
  var parser: any = new DotProto.Parser(protoString);
  var ast: any = parser.parse();
    
  return ast;
}  
