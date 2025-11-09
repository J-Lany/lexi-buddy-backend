import { Injectable, BadRequestException } from '@nestjs/common';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { UserRepository } from 'repositories/user.repository';
import { ContactTypeRepository } from 'repositories/contact-type.repository';
import { RoleRepository } from 'repositories/role.repository';
import { UserContactRepository } from 'repositories/user-contact.repository';

@Injectable()
export class AuthService {
  constructor(
    private mail: MailService,
    private userRepo: UserRepository,
    private contactTypeRepo: ContactTypeRepository,
    private userContactRepo: UserContactRepository,
    private roleRepo: RoleRepository,
  ) {}

  async register(dto: RegisterDto) {
    const exist = await this.userContactRepo.findByEmail(dto.email);

    if (exist) throw new BadRequestException('Email already exist');

    const passwordHash = await argon.hash(dto.password);
    const activationToken = randomUUID();

    const teacherRole = await this.roleRepo.findByName('teacher');

    if (!teacherRole) throw new BadRequestException('Teacher role not found');

    const contactType = await this.contactTypeRepo.findByName('email');

    if (!contactType)
      throw new BadRequestException('Contact email is not found');

    const data = {
      passwordHash,
      roleId: teacherRole.id,
      activationToken,
      activationExpires: new Date(Date.now() + 86400000),
      email: dto.email,
      contactTypeId: contactType.id,
    };

    await this.userRepo.createUserByEmail(data);
    await this.mail.sendActivationMail(dto.email, activationToken);

    return { message: 'Activation email sent' };
  }

  async activate(token: string) {
    const user = await this.userRepo.findByActivationToken(token);

    if (!user) throw new BadRequestException('Invalid token');

    await this.userRepo.updateUserVerification(user.id);

    return { message: 'Account activated' };
  }
}
