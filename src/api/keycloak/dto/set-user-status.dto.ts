import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class SetUserStatusDto {
  /**
   * UUID del usuario en Keycloak (campo `id` de la representación de usuario).
   * No es la cédula ni el email — se obtiene de los endpoints find-by-*.
   */
  @IsString()
  @IsNotEmpty()
  id: string;

  /**
   * true  → habilita la cuenta (el usuario puede iniciar sesión)
   * false → deshabilita la cuenta (Keycloak bloquea el login)
   */
  @IsBoolean()
  @IsNotEmpty()
  enabled: boolean;
}
