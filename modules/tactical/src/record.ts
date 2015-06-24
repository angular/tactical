/**
 * A Record is a version of an object stored in persistent local cache and identified by a single
 * combination of a key and a version. The key identifies the Chain of Records for a single object
 * and the version identifies the particular Record of that object.
 * 
 * Each instance of a Record requires the version that identifies it and the value of the object
 * for that version.
 */
export class Record {
  
  constructor(private _version: string, private _value: Object) {}
  
  /**
   * Returns the version identifier of the Record.
   */
  get version(): string {
    return this._version;
  }
  
  /**
   * Returns the value of the object stored in the Record.
   */
  get value(): Object {
    return this._value;
  }
  
}
