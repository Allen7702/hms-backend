import request from 'supertest';
import {app} from '../index'; 

describe('API Endpoints', () => {
  it('POST /api/users/login', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'manager', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});