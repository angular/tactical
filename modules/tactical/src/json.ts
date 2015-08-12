/**
 * Stringify a JSON object (sorting its properties first).
 *
 * TODO: Optimize.
 */
export function serializeObject(obj: Object): string {
  var keys: Array<string> = [];
  var result = '{';
  for (var key in obj) {
    keys.push(key);
  }
  keys.sort();
  if (keys.length > 0) {
    result += '"' + keys[0] + '":' + serializeValue(obj[keys[0]]);
    for (var i = 1; i < keys.length; i++) {
      var k: string = keys[i];
      result += ',"' + k + '":' + serializeValue(obj[k]);
    }
  }
  return result + '}';
}

/**
 * Stringify any value, recursively if necessary.
 */
export function serializeValue(value: any): string {
  var type = typeof value;
  if (type === 'string' || type === 'number') {
    return JSON.stringify(value);
  } else if (type === 'boolean') {
    return value ? 'true' : 'false';
  } else if (type === 'object') {
    if (value === null) {
      return 'null';
    } else if (Array.isArray(value)) {
      return serializeArray(<Array<any>>value);
    } else {
      return serializeObject(<Object>value);
    }
  } else if (value === undefined) {
    return null;
  } else {
    throw 'unsupported type: "' + type + '" for ' + value;
  }
}

/**
 * Stringify an array, recursively.
 */
export function serializeArray(value: Array<any>): string {
  var result = '[';
  if (value.length > 0) {
    result += serializeValue(value[0]);
    for (var i = 1; i < value.length; i++) {
      result += ',' + serializeValue(value[i]);
    }
  }
  return result + ']';
}
