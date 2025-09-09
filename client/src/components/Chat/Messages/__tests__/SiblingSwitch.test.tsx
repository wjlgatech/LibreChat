import React from 'react';
import { render, screen } from '@testing-library/react';
import SiblingSwitch from '../SiblingSwitch';

describe('SiblingSwitch', () => {
  it('returns null when siblingIdx is undefined', () => {
    const { container } = render(
      <SiblingSwitch
        siblingIdx={undefined}
        siblingCount={5}
        setSiblingIdx={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('returns null when siblingCount is undefined', () => {
    const { container } = render(
      <SiblingSwitch
        siblingIdx={0}
        siblingCount={undefined}
        setSiblingIdx={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('returns null when siblingCount is 1 or less', () => {
    const { container } = render(
      <SiblingSwitch
        siblingIdx={0}
        siblingCount={1}
        setSiblingIdx={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows navigation when siblingCount > 1', () => {
    render(
      <SiblingSwitch
        siblingIdx={0}
        siblingCount={3}
        setSiblingIdx={jest.fn()}
      />
    );

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous sibling message')).toBeInTheDocument();
    expect(screen.getByLabelText('Next sibling message')).toBeInTheDocument();
  });
});