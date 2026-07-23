import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
/**
 * REST controller exposing authentication operations.
 *
 * Base route: `auth`. Delegates all business logic to {@link AuthService}.
 */
@ApiTags('Auth')
@ApiBearerAuth('keycloak')
@Controller('auth')
export class AuthController {
    /**
     *
     * @param authService
     */
    constructor(private readonly authService: AuthService) {}
}
