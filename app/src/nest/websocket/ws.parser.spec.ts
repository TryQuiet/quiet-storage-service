import { Decoder, Encoder, PacketType } from 'socket.io-parser'
import { MAX_SOCKET_ATTACHMENTS, quietSocketParser } from './ws.parser.js'

const decodeBinaryPacket = async (
  decoder: {
    on: (event: string, listener: (value: unknown) => void) => void
    add: (chunk: unknown) => void
  },
  attachments: number,
): Promise<{ data: unknown[] }> => {
  const packet = {
    type: PacketType.EVENT,
    nsp: '/',
    data: [
      'sync',
      ...Array.from({ length: attachments }, (_, i) => new Uint8Array([i])),
    ],
  }
  const encoded = new Encoder().encode(packet)
  return await new Promise((resolve, reject) => {
    decoder.on('decoded', value => {
      resolve(value as { data: unknown[] })
    })
    try {
      for (const chunk of encoded) decoder.add(chunk)
    } catch (e) {
      reject(e as Error)
    }
  })
}

describe('quietSocketParser', () => {
  it('accepts more binary attachments than the socket.io-parser default of 10', async () => {
    const decoded = await decodeBinaryPacket(
      new quietSocketParser.Decoder(),
      50,
    )
    expect(decoded.data).toHaveLength(51)
  })

  it('still rejects packets above the configured cap', async () => {
    await expect(
      decodeBinaryPacket(
        new quietSocketParser.Decoder(),
        MAX_SOCKET_ATTACHMENTS + 1,
      ),
    ).rejects.toThrow('too many attachments')
  })

  it('shows the default decoder rejects the same 50-attachment packet', async () => {
    await expect(decodeBinaryPacket(new Decoder(), 50)).rejects.toThrow(
      'too many attachments',
    )
  })
})
