import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './form-field';
import { Input } from './input';

describe('FormField component', () => {
  it('renders label and input connected by id', () => {
    render(
      <FormField id="username-field" label="Username">
        <Input placeholder="Enter username" />
      </FormField>,
    );

    const label = screen.getByText('Username');
    const input = screen.getByPlaceholderText('Enter username');

    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', 'username-field');
    expect(input).toHaveAttribute('id', 'username-field');
  });

  it('renders required indicator when required prop is true', () => {
    render(
      <FormField id="req-field" label="Email" required>
        <Input type="email" />
      </FormField>,
    );

    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('wires aria-describedby for hints', () => {
    render(
      <FormField id="hint-field" label="Bio" hint="Max 200 characters">
        <Input />
      </FormField>,
    );

    const input = screen.getByRole('textbox');
    const hint = screen.getByText('Max 200 characters');

    expect(hint).toHaveAttribute('id', 'hint-field-hint');
    expect(input).toHaveAttribute('aria-describedby', 'hint-field-hint');
  });

  it('wires aria-describedby and aria-invalid for error state', () => {
    render(
      <FormField id="err-field" label="Password" error="Password is required">
        <Input type="password" />
      </FormField>,
    );

    const input = screen.getByLabelText('Password');
    const errorMsg = screen.getByRole('alert');

    expect(errorMsg).toHaveTextContent('Password is required');
    expect(errorMsg).toHaveAttribute('id', 'err-field-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'err-field-error');
  });

  it('combines hint and error IDs in aria-describedby when both present', () => {
    render(
      <FormField id="both-field" label="Code" hint="6-digit code" error="Invalid verification code">
        <Input />
      </FormField>,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'both-field-hint both-field-error');
  });

  it('supports render prop function as child', () => {
    render(
      <FormField id="func-field" label="Custom" error="Error here">
        {(props) => (
          <input
            data-testid="custom-input"
            id={props.id}
            aria-describedby={props['aria-describedby']}
            aria-invalid={props['aria-invalid']}
          />
        )}
      </FormField>,
    );

    const input = screen.getByTestId('custom-input');
    expect(input).toHaveAttribute('id', 'func-field');
    expect(input).toHaveAttribute('aria-describedby', 'func-field-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not pass unknown error prop to native DOM element child', () => {
    render(
      <FormField id="native-field" label="Native" error="Some error">
        <input data-testid="native-input" />
      </FormField>,
    );

    const input = screen.getByTestId('native-input');
    expect(input).toHaveAttribute('id', 'native-field');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).not.toHaveAttribute('error');
  });
});
