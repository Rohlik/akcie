"""
Regression tests for the FIFO engine and the 3-year time test.

Every function under test is pure and takes plain dicts, and current_date /
current_year are injectable, so none of this needs a database or a clock.
"""
from datetime import date

import pytest

from tax_calculator import (
    add_years,
    three_year_test_met,
    calculate_holdings,
    get_three_year_holdings,
    calculate_current_year_sales,
    calculate_current_year_sales_three_years,
)


def buy(stock, d, price, qty, fees=0.0):
    return {'stock_name': stock, 'type': 'buy', 'date': d,
            'price': price, 'quantity': qty, 'fees': fees}


def sell(stock, d, price, qty, fees=0.0):
    return {'stock_name': stock, 'type': 'sell', 'date': d,
            'price': price, 'quantity': qty, 'fees': fees}


# --- FIFO lot consumption -----------------------------------------------------

def test_sell_spanning_two_lots_consumes_both():
    holdings = calculate_holdings([
        buy('X', '2020-01-01', 100, 10),
        buy('X', '2021-01-01', 200, 10),
        sell('X', '2022-01-01', 300, 15),
    ])
    assert holdings == [{
        'stock_name': 'X',
        'purchase_date': date(2021, 1, 1),
        'purchase_price': 200.0,
        'quantity': 5,
    }]


def test_sell_spanning_three_lots_leaves_the_newest_lot():
    holdings = calculate_holdings([
        buy('X', '2020-01-01', 100, 10),
        buy('X', '2021-01-01', 200, 10),
        buy('X', '2022-01-01', 300, 10),
        sell('X', '2023-01-01', 400, 25),
    ])
    assert holdings == [{
        'stock_name': 'X',
        'purchase_date': date(2022, 1, 1),
        'purchase_price': 300.0,
        'quantity': 5,
    }]


def test_selling_everything_leaves_no_lots():
    assert calculate_holdings([
        buy('X', '2020-01-01', 100, 10),
        buy('X', '2021-01-01', 200, 10),
        sell('X', '2022-01-01', 300, 20),
    ]) == []


def test_buy_fees_fold_into_the_effective_price():
    holdings = calculate_holdings([buy('X', '2020-01-01', 100, 10, fees=50)])
    assert holdings[0]['purchase_price'] == pytest.approx(105.0)


# --- Calendar arithmetic ------------------------------------------------------

def test_add_years_crosses_leap_day():
    assert add_years(date(2021, 3, 1), 3) == date(2024, 3, 1)


def test_add_years_clamps_29_february():
    assert add_years(date(2020, 2, 29), 3) == date(2023, 2, 28)


@pytest.mark.parametrize('purchase, sale, expected', [
    # A window containing a leap day is 1096 days; the old 3*365 day count
    # exempted the day before the anniversary.
    (date(2021, 3, 1), date(2024, 2, 29), False),
    (date(2021, 3, 1), date(2024, 3, 1), False),   # anniversary itself: still taxable
    (date(2021, 3, 1), date(2024, 3, 2), True),
])
def test_time_test_boundary(purchase, sale, expected):
    assert three_year_test_met(purchase, sale) is expected


def test_three_year_holdings_use_the_anniversary_not_1095_days():
    holdings = calculate_holdings([buy('X', '2021-03-01', 100, 10)])
    assert get_three_year_holdings(holdings, current_date=date(2024, 2, 29)) == {}
    assert get_three_year_holdings(holdings, current_date=date(2024, 3, 2))['X']['quantity'] == 10


# --- The two sales buckets must partition -------------------------------------

@pytest.mark.parametrize('sale_date', [
    '2022-12-30',  # short of three years
    '2022-12-31',  # exactly 1095 days: the old double-count
    '2023-01-01',  # the anniversary itself
    '2023-01-02',  # past it
])
def test_taxable_and_exempt_buckets_never_overlap_or_gap(sale_date):
    txs = [
        buy('Y', '2020-01-01', 100, 10),
        sell('Y', sale_date, 200, 10),
    ]
    year = int(sale_date[:4])
    taxable = calculate_current_year_sales(txs, year)
    exempt = calculate_current_year_sales_three_years(txs, year)
    net_proceeds = 2000.0

    assert taxable + exempt == pytest.approx(net_proceeds)
    assert 0.0 in (taxable, exempt), "a single lot must land in exactly one bucket"


def test_partial_exemption_splits_proceeds_by_share_count():
    # Two lots sold together: the older one passes the time test, the newer does not.
    txs = [
        buy('Z', '2019-01-01', 100, 10),
        buy('Z', '2022-06-01', 150, 10),
        sell('Z', '2023-01-01', 200, 20),
    ]
    taxable = calculate_current_year_sales(txs, 2023)
    exempt = calculate_current_year_sales_three_years(txs, 2023)

    assert taxable == pytest.approx(2000.0)
    assert exempt == pytest.approx(2000.0)
    assert taxable + exempt == pytest.approx(4000.0)


def test_sell_fees_reduce_the_counted_proceeds():
    txs = [
        buy('Y', '2023-01-01', 100, 10),
        sell('Y', '2023-06-01', 200, 10, fees=75),
    ]
    assert calculate_current_year_sales(txs, 2023) == pytest.approx(1925.0)
