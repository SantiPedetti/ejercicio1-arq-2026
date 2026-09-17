import request from 'supertest';
import { createApp } from '../../src/app';

describe('middleware x-correlation-id', () => {
  it('conserva un correlation-id valido enviado por el cliente', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/health')
      .set('x-correlation-id', 'valid-id-1234');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('valid-id-1234');
  });

  it('reemplaza un correlation-id invalido por un UUID para prevenir inyeccion en logs', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/health')
      .set('x-correlation-id', 'invalid id with spaces <script>');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).not.toBe('invalid id with spaces <script>');
    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('genera un UUID cuando el cliente no envia header x-correlation-id', async () => {
    const app = createApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
