import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  create(dto: CreateProductDto) {
    return this.productsRepository.save(this.productsRepository.create(dto));
  }

  findAll() {
    return this.productsRepository.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number) {
    const product = await this.productsRepository.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }
}
