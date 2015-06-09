/**
 * Represents a mutation to be performed on top of an object.
 */
export interface Mutation {
  
  /**
   * Applies the mutation to an object, returning success or failure.
   */
  apply(obj: any): boolean;
}

/**
 * Sets a group of properties on an object, overwriting any previous values.
 */
export class SetPropertiesMutation implements Mutation {
  changes: any;
  
  constructor(changes: any) {
    this.changes = changes;
  }
  
  apply(obj: any): boolean {
    if (obj == null) {
      return false;
    }
    var props = Object.getOwnPropertyNames(this.changes);
    for (var i = 0; i < props.length; i++) {
      var key: string = props[i];
      obj[key] = this.changes[key];
    }
    return true;
  }
}

/**
 * Applies a set of mutations to the value of a child property on an object.
 */
export class SubPropertyMutation implements Mutation {
  key: string;
  mutations: Mutation[];
  
  constructor(key: string, mutations: Mutation[]) {
    this.key = key;
    this.mutations = mutations;
  }
  
  apply(obj: any): boolean {
    // Cannot apply mutations to something which isn't there.
    if (!obj.hasOwnProperty(this.key)) {
      return false;
    }
    var value = obj[this.key];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return this.mutations.every((mutation) => mutation.apply(value));
  }
}

/**
 * Sets the value of an index on an array, if it exists.
 */
export class ArrayValueMutation implements Mutation {
  index: number;
  value: any;
  
  constructor(index: number, value: any) {
    this.index = index;
    this.value = value;
  }
  
  apply(obj: any): boolean {
    if (!Array.isArray(obj)) {
      return false;
    }
    obj[this.index] = this.value;
    return true;
  }
}

/**
 * Truncates an array to the given length.
 */
export class ArrayTruncationMutation implements Mutation {
  length: number;
  
  constructor(length: number) {
    this.length = length;
  }
  
  apply(obj: any): boolean {
    if (!Array.isArray(obj) || obj.length < this.length) {
      return false;
    }
    obj.length = this.length;
    return true;
  }
}

/**
 * Applies a set of mutations to the value of an index of an array.
 */
export class ArraySubMutation implements Mutation {
  index: number;
  mutations: Mutation[];
  
  constructor(index: number, mutations: Mutation[]) {
    this.index = index;
    this.mutations = mutations;
  }
  
  apply(obj: any): boolean {
    if (!Array.isArray(obj) || obj.length <= this.index) {
      return false;
    }
    var value = obj[this.index];
    return this.mutations.every((mutation) => mutation.apply(value));
  }
}
