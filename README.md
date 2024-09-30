# Immutable ArrayBuffers

A TC39 proposal for immutable ArrayBuffers.

## Status

[The TC39 Process](https://tc39.es/process-document/)

**Stage**: 0

**Champion**: Mark S. Miller (@erights)

**Specification**: https://papers.agoric.com/tc39-proposal-immutable-arraybuffer/

## Presentation history

## Background

Prior proposals [In-Place Resizable and Growable `ArrayBuffer`s](https://github.com/tc39/proposal-resizablearraybuffer) and [ArrayBuffer.prototype.transfer and friends](https://github.com/tc39/proposal-arraybuffer-transfer) have both reached stage 4, and so are now an official part of JavaScript. Altogether, `ArrayBuffer.prototype` now has the following methods:
- `transfer(newByteLength?: number) :ArrayBuffer` -- move the contents of the original buffer to a new buffer, detach the original buffer, and return the new buffer. The new buffer will be as resizable as the original was.
- `transferToFixedLength(newByteLength?: number) :ArrayBuffer` -- like `transfer` but the new buffer is not resizable.
- `resize(newByteLength: number) :void` -- change the size of this buffer if possible, or throw otherwise.
- `slice(start?: number, end?: number) :ArrayBuffer` -- Return a new buffer whose initial contents are a copy of that region of the original buffer. The original buffer is unmodified.

and the following read-only accessor properties
- `detached: boolean` -- is this buffer detached, or are its contents still available from this buffer object?
- `resizable: boolean` -- can this buffer be resized, or is it fixed-length?
- `byteLength: number` -- how big are the current contents of this buffer?
- `maxByteLength: number` -- how big could this buffer be resized to be?

None of the operations above enable the creation of an immutable buffer, i.e., a non-detached buffer whose contents cannot be changed, resized, or detached.

Both a `DataView` object and a `TypedArray` object are views into a buffer backing store. For a `TypedArray` object, the contents of the backing store appear as indexed data properties of the `TypeArray` object that reflect the current contents of this backing store. Currently, because there is no way to prevent the contents of the backing store from being changed, `TypedArray`s cannot be frozen.

## Motivation

Some JavaScript implementations, like Moddable XS, bring JavaScript to embedded systems, like device controllers, where ROM is much more plentiful and cheaper than RAM. These systems need to place voluminous fixed data into ROM, and currently do so using semantics outside the official JavaScript standard.

APIs that accept ArrayBuffers and/or objects backed by them could also benefit from performance improvement by avoiding defensive copies when the input buffers are immutable (see [Generic zero-copy ArrayBuffer usage](https://gist.github.com/domenic/a9343fa787ba54b4ba3a60882c49cc32) for a proposed alternative solution to this problem in the Web Platform).

The [OCapN](https://ocapn.org/) network protocol treats strings and byte-arrays as distinct forms of bulk data to be transmitted by copy. At JavaScript endpoints speaking OCapN such as [@endo/pass-style](https://www.npmjs.com/package/@endo/pass-style) + [@endo/marshal](https://www.npmjs.com/package/@endo/marshal), JavaScript strings represent OCapN strings. The immutability of strings in the JavaScript language reflects their by-copy nature in the protocol. Likewise, to reflect an OCapN byte-array well into the JavaScript language, an immutable container of bulk binary data is required. There currently are none, but an Immutable `ArrayBuffer` would provide exactly the necessary low-level machinery.

## Solution

This proposal introduces additional methods and read-only accessor properties to `ArrayBuffer.prototype` that fit naturally into those explained above. Just as a buffer can be resizable or not, and detached or not, this proposal enables buffers to be immutable or not. Just as `transferToFixedSize` moves the contents of a original buffer into a newly created non-resizable buffer, this proposal provides a transfer operation that moves the contents of an original original buffer into a newly created immutable buffer. Altogether, this proposal only adds to `ArrayBuffer.prototype` one method
- `transferToImmutable() :ArrayBuffer` -- move the contents of the original buffer into a new immutable buffer, detach the original buffer, and return the new buffer.

and one read-only accessor
- `immutable: boolean` -- is this buffer immutable, or can its contents be changed?

An immutable buffer cannot be detached, resized, or further transferred. Its `maxByteLength` is the same as its `byteLength`. A `DataView` or `TypedArray` using an immutable buffer as its backing store can be frozen and immutable. `ArrayBuffer`s, `DataView`s, and `TypedArray`s that are frozen and immutable could be placed in ROM without going beyond JavaScript's official semantics.

The ArrayBuffer `slice` method and TypedArray methods that create new ArrayBuffers (`filter`, `map`, `slice`, `toReversed`, etc.) make no effort to preserve immutability, just like they make no effort to preserve resizability (although use of SpeciesConstructor in those methods means that _lack_ of resizability/immutability in the result cannot be guaranteed for the latter).

## Implementations

### Polyfill/transpiler implementations

* [endo immutable-arraybuffer](https://github.com/endojs/endo/tree/master/packages/immutable-arraybuffer)

### Native implementations

Tracking issues to be added:
- JavaScriptCore
- SpiderMonkey
- XS
- V8

## Q&A

* Should `transferToImmutable` support a `newByteLength` argument?
* Should trying to write data in an immutable ArrayBuffer via a TypedArray element set throw, even though trying to write out-of-bounds or to a detached ArrayBuffer does not?
* Should TypedArray write methods (`copyWithin`, `fill`, `reverse`, `set`, etc.) throw when their backing ArrayBuffer is immutable but the targeted range is zero-length? If so, how early or late in the algorithm? The methods currently inspect arguments after ValidateTypedArray.
* Similarly,
  * How early or late in SetViewValue against an immutable ArrayBuffer should an exception be thrown? It currently inspects arguments *before* IsViewOutOfBounds.
  * Likewise for abstract operations such as ArrayBufferCopyAndDetach (which currently checks IsSharedArrayBuffer, then _newLength_, then IsDetachedBuffer).
  * And also for `Atomics` functions.
