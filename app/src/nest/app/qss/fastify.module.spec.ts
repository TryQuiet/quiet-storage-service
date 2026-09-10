import Fastify from 'fastify'

describe('Fastify direct-peer configuration', () => {
  it('does not accept a client-supplied forwarded address by default', async () => {
    const fastify = Fastify()
    fastify.get('/', request => ({ ip: request.ip }))

    const response = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-forwarded-for': '203.0.113.99' },
    })

    expect(response.json()).toEqual({ ip: '127.0.0.1' })
    await fastify.close()
  })
})
