import { Utils } from '@mikro-orm/core'

const withOwnPrototypeProperty = (value: object): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}
  Object.defineProperty(payload, '__proto__', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })
  return payload
}

const reservedKeyPayloads: Array<
  [string, (marker: string) => Record<string, unknown>]
> = [
  ['__proto__', marker => withOwnPrototypeProperty({ [marker]: 'polluted' })],
  [
    'constructor',
    marker => ({ constructor: { prototype: { [marker]: 'polluted' } } }),
  ],
  ['prototype', marker => ({ prototype: { [marker]: 'polluted' } })],
]

describe('MikroORM prototype pollution regression', () => {
  it.each(reservedKeyPayloads)(
    'ignores a nested %s key during object merges',
    (reservedKey, makePayload) => {
      const marker = `mikroOrm${reservedKey}PrototypePollutionRegression`
      const { prototype: objectPrototype } = Object
      const previous = Object.getOwnPropertyDescriptor(objectPrototype, marker)
      const target: Record<string, unknown> = {}

      try {
        Utils.merge(target, makePayload(marker))

        expect(Object.hasOwn(target, reservedKey)).toBe(false)
        expect(Object.hasOwn(objectPrototype, marker)).toBe(false)
        expect(Reflect.get({}, marker)).toBeUndefined()
      } finally {
        if (previous === undefined)
          Reflect.deleteProperty(objectPrototype, marker)
        else Object.defineProperty(objectPrototype, marker, previous)
      }
    },
  )
})
