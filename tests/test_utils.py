"""Validation guards. Skipped where Flask isn't installed, since utils imports it."""
import pytest

pytest.importorskip('flask')

from utils import validate_price, validate_fees  # noqa: E402


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_non_finite_prices_are_rejected(value):
    ok, _ = validate_price(value)
    assert ok is False


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_non_finite_fees_are_rejected(value):
    ok, _ = validate_fees(value)
    assert ok is False


def test_ordinary_values_still_pass():
    assert validate_price(123.45)[0] is True
    assert validate_fees(0.0)[0] is True
