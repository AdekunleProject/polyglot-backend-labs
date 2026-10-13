import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Todo } from './entities/todo.entity';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodosService {
  constructor(
    @InjectRepository(Todo)
    private readonly todosRepository: Repository<Todo>,

  ) {}

  create(title: string){
    const todo = this.todosRepository.create({title});
     if (!todo) {
      throw new NotFoundException(`Todo ${title} not found`)
    }
    return this.todosRepository.save(todo);
  };

  findAll() {
    return this.todosRepository.find({order: {createdAt: 'DESC'}})
  };

  async findOne(id: number) {
    const todo = await this.todosRepository.findOneBy({id});
    if (!todo) {
      throw new NotFoundException(`Todo ${id} not found`)
    }
    return todo;
  };

  async remove(id: number) {
    const result = await this.todosRepository.delete({id});
    if (result.affected === 0) {
      throw new NotFoundException(`Todo ${id} not found`)
    }
    return {deleted: true};
  }  

  async update(id: number, updateTodoDto: UpdateTodoDto) {
    const todo = await this.todosRepository.findOneBy({id});
    if (!todo) {
      throw new NotFoundException(`Todo ${id} cannot be updated`);
    }

    Object.assign(todo, updateTodoDto);

    return this.todosRepository.save(todo);
  }

  // update(id:number, updateTodoDto: UpdateTodoDto) {
  //   return `This action updates a #${id} todo`
  // }
}