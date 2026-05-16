import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

describe('AuthController', () => {
  it('should be defined', () => {
    const controller = new AuthController({} as AuthService);
    expect(controller).toBeDefined();
  });
});
