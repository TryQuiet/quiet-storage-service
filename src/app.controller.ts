import { Controller, Get, Put, Query, Body, NotFoundException, InternalServerErrorException, UsePipes, ValidationPipe, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { InvitationDTO } from './dto/invitation.dto';
import { AuthGuard } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('invite')
  @UseGuards(AuthGuard)
  invite(@Query('CID') cid: string) {
    const contents = this.appService.getInvitationFile(cid);
    if (contents === null) {
      throw new NotFoundException('Invitation data not found');
    }
    return contents;
  }

  @Put('invite')
  @UseGuards(AuthGuard)
  @UsePipes(new ValidationPipe())
  storeInvitation(@Query('CID') cid: string, @Body() invitationDTO: InvitationDTO) {
    const filename = `${cid}.json`;
    const result = this.appService.storeInvitationFile(filename, invitationDTO);
    if (!result.status) {
      throw new InternalServerErrorException(result.message);
    }
  }
}
