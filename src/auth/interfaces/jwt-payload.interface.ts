import { TypeRol } from 'src/common/glob/type/type_rol';

export interface JwtPayload {
  id: number;
  email: string;
  idDevice: string;
  idApp: number;
  roles: TypeRol[];
  kcToken?: string;
  kcRefreshToken?: string;
  isActive?: boolean;
}
