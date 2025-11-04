import { Injectable, BadRequestException } from '@nestjs/common';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
import {PrismaService} from "../prisma/prisma.service";
import {MailService} from "../mail/mail.service";
import {RegisterDto} from "./dto/register.dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const exist = await this.prisma.userContact.findFirst({
      where: {contactValue: dto.email}
    })

    if(exist) throw new BadRequestException("Email already exist")

    const hash  = await argon.hash(dto.password)
    const token = randomUUID()

    const teacherRole = await this.prisma.role.findFirst({where: {name: "teacher"}})

    if(!teacherRole) throw new BadRequestException("Teacher role not found")

    const contactEmail = await this.prisma.contactType.findFirst( { where: {name: "email"}})
    if(!contactEmail) throw new BadRequestException("Contact email is not found")

    const user = this.prisma.user.create({
      data: {
        passwordHash: hash,
        roleId: teacherRole.id,
        activationToken: token,
        activationExpires: new Date(Date.now() + 86400000),
        contacts: {
          create: {
            contactValue: dto.email,
            contactTypeId: contactEmail.id,
            isPrimary: true,
          }
        }
      }
    })

    await this.mail.sendActivationMail(dto.email, token)

    return { message: 'Activation email sent' };
  }

  async activate(token: string) {
    const user = await this.prisma.user.findFirst({where: {activationToken: token}})

    if(!user) throw new BadRequestException('Invalid token')

    await this.prisma.user.update({
      where: {id: user.id},
      data: {
        verified: true,
        activationToken: null,
        activationExpires: null
      }
    })

    return { message: 'Account activated' };
  }
}
