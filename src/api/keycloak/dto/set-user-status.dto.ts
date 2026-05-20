import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SetUserStatusDto {
  /**
   * true  → habilita la cuenta (el usuario puede iniciar sesión)
   * false → deshabilita la cuenta (Keycloak bloquea el login)
   */
  @IsBoolean()
  @IsNotEmpty()
  enabled: boolean;
}
