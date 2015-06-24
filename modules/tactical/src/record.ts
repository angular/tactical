/**
 * A Record is a version of an object stored in persistent local cache and identified by a single
 * combination of a key and a version. The key identifies the Chain of Records for a single object
 * and the version identifies the particular Record of that object.
 *
 * Each instance of a Record requires the version that identifies it and the value of the object
 * for that version.
 */
export interface Record {
  version: string;
  value: Object;
}
