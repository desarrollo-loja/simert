import { SetMetadata } from '@nestjs/common';
import { TypeRol } from 'src/common/glob/type/type_rol';

export const META_ROLES = 'roles';

export const RoleProtected = (...args: TypeRol[]) => {
  return SetMetadata(META_ROLES, args);
};
