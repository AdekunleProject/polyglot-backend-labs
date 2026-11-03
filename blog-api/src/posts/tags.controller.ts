import { Controller, Get } from '@nestjs/common';
import { PostsService } from './posts.service';

@Controller('tags')
export class TagsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll() {
    return this.postsService.tagsWithCounts();
  }
}
