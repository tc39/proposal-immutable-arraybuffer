# Immutable ArrayBuffers

A TC39 proposal for immutable ArrayBuffers.

## Status

[The TC39 Process](https://tc39.es/process-document/)

**Stage**: 2

**Champions**:
- Mark S. Miller (@erights)
- Peter Hoddie (@phoddie)
- Richard Gibson (@gibson042)
- Jack-Works (@Jack-Works)

**Specification**: https://tc39.es/proposal-immutable-arraybuffer/

## Presentation history

- ***for stage 1*** - October 2024 tc39 plenary ([slides.key](./immu-arraybuffer-talks/immu-arrayBuffers-stage1-as-recorded.key), [slides.pdf](./immu-arraybuffer-talks/immu-arrayBuffers-stage1.pdf), [video](https://www.youtube.com/watch?v=CP_5Yo9h84k))
- ***for stage 2*** - To be presented at December 2024 tc39 plenary ([slides.key](./immu-arraybuffer-talks/immu-arrayBuffers-stage2.key). [slides.pdf](./immu-arraybuffer-talks/immu-arrayBuffers-stage2.pdf), [docs slides](https://docs.google.com/presentation/d/1S1ixC7AVg3s_p4ZNhu3zBMcIcKbFkmp6umnsQUKOIqw/edit?usp=sharing))

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

## Prior proposals or issues with overlapping goals

[Limited ArrayBuffer](https://github.com/tc39/proposal-limited-arraybuffer), especially [issue #16](https://github.com/tc39/proposal-limited-arraybuffer/issues/16)

[Readonly Collections](https://github.com/tc39/proposal-readonly-collections), especially [issue #10](https://github.com/tc39/proposal-readonly-collections/issues/10)

web-bluetooth [read-only ArrayBuffer](https://webbluetoothcg.github.io/web-bluetooth/#read-only-arraybuffer), especially [issue #300](https://github.com/WebBluetoothCG/web-bluetooth/issues/300#issuecomment-2560251857)

gpuweb [issue #2072](https://github.com/gpuweb/gpuweb/issues/2072#issuecomment-2560291036), [issue #747](https://github.com/gpuweb/gpuweb/issues/747#issuecomment-2560254816), and [SharedValueTable proposal](https://hackmd.io/@webgpu/S1f56dN8s)

webidl [Frozen Array](https://webidl.spec.whatwg.org/#idl-frozen-array)


## Solution

This proposal introduces additional methods and read-only accessor properties to `ArrayBuffer.prototype` that fit naturally into those explained above. Just as a buffer can be resizable or not, and detached or not, this proposal enables buffers to be immutable or not. Just as `transferToFixedSize` moves the contents of a original buffer into a newly created non-resizable buffer, this proposal provides a transfer operation that moves the contents of an original original buffer into a newly created immutable buffer. Altogether, this proposal only adds to `ArrayBuffer.prototype` one method
- `transferToImmutable(newByteLength?: number) :ArrayBuffer` -- move the contents of the original buffer into a new immutable buffer, detach the original buffer, and return the new buffer.

and one read-only accessor
- `immutable: boolean` -- is this buffer immutable, or can its contents be changed?

An immutable buffer cannot be detached, resized, or further transferred. Its `maxByteLength` is the same as its `byteLength`. A `DataView` or `TypedArray` using an immutable buffer as its backing store can be frozen and immutable. `ArrayBuffer`s, `DataView`s, and `TypedArray`s that are frozen and immutable could be placed in ROM without going beyond JavaScript's official semantics.

The ArrayBuffer `slice` method and TypedArray methods that create new ArrayBuffers (`filter`, `map`, `slice`, `toReversed`, etc.) make no effort to preserve immutability, just like they make no effort to preserve resizability (although use of SpeciesConstructor in those methods means that _lack_ of resizability/immutability in the result cannot be guaranteed for the latter).

## Use cases

### Represent arbitrary binary data as an immutable [netstring](https://en.wikipedia.org/wiki/Netstring)

```js
const consumeIntoNetstring = data => {
  // Transfer to a new ArrayBuffer with room for the netstring framing.
  // https://en.wikipedia.org/wiki/Netstring
  const prefix = new TextEncoder().encode(`${data.length}:`);
  const buf = data.buffer.transfer(prefix.length + data.length + 1);

  // Frame the data.
  const tmpArr = new Uint8Array(buf);
  tmpArr.copyWithin(prefix.length, 0);
  tmpArr.set(prefix);
  tmpArr[tmpArr.length - 1] = 0x2C;

  // Transfer to an immutable ArrayBuffer backing a frozen Uint8Array.
  const frozenNetstring = Object.freeze(new Uint8Array(buf.transferToImmutable()));
  assert(buf.detached);
  return frozenNetstring;
};

const input = new TextEncoder().encode('hello world!');
const result = consumeIntoNetstring(input);
assert(Object.isFrozen(result));
try { result[0] = 0; } catch (_err) {}
try { new Uint8Array(result.buffer)[0] = 1; } catch (_err) {}
try { result.buffer.transferToImmutable(); } catch (_err) {}
assert(String.fromCharCode(...result) === '12:hello world!,');
```

## Implementations

### Polyfill/transpiler implementations

* [endo immutable-arraybuffer](https://github.com/endojs/endo/tree/master/packages/immutable-arraybuffer)

### Native implementations

Tracking issues to be added:
- JavaScriptCore
- SpiderMonkey
- XS (implemented. need link)
- V8

## Q&A

<dl>
<!-- Markdown rendering of HTML blocks requires a blank line before further Markdown content. -->


<dt>

Why can't an immutable ArrayBuffer be detached/transferred?
</dt>
<dd>

Because that would result in observable changes to any TypedArray or DataView backed by it.
</dd>


<dt>

Should the index properties of a TypedArray backed by an immutable ArrayBuffer be configurable and writable?
</dt>
<dd>

No, TypedArray index properties should continue to track the state of the underlying buffer without individual bookkeeping.
</dd>


<dt>

Should ArrayBuffers support zero-copy slices (e.g., `arrayBuffer.sliceToImmutable()`)? https://github.com/tc39/proposal-immutable-arraybuffer/issues/9
</dt>
<dd>

Yes. As agreed at the December tc39 plenary, we won't specify that the implementation be zero-copy. But providing this operation ***enables*** some implementations to easily implement it as zero-copy.
</dd>

<dt>

Should the new getter be named `immutable` or `mutable`? https://github.com/tc39/proposal-immutable-arraybuffer/issues/10
</dt>
<dd>

`immutable`. As agreed at the December tc39 plenary, by following the defaults-to-false principle, feature tests such as `if (buf.immutable) {` will be falsy on engines that have not yet implemented this proposal.
</dd>

<dt>

Order of operations, when to throw or silently do nothing? https://github.com/tc39/proposal-immutable-arraybuffer/issues/16

</dt>
<dd>

We will drive the resolution to this from implementor feedback. But when this by itself is not a deciding factor, we prefer failure to throw rather than be silent. This existing XS implementation follows that principle.
</dd>

<dl>
