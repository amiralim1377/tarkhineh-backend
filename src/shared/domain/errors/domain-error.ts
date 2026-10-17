import { AppError } from '../../errors/app-error.js';
import {
  ERROR_CATEGORY,
  type ErrorCategory,
} from '../../errors/error-category.js';

export abstract class DomainError extends AppError {
  override readonly category: ErrorCategory = ERROR_CATEGORY.BUSINESS_RULE;
}
