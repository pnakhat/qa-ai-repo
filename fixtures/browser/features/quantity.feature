Feature: Quantity limits
  Scenario Outline: Accept only supported quantities
    Given an order quantity of <quantity>
    When the order is validated
    Then the order is "<status>"
    Examples:
      | quantity | status   |
      | 0        | rejected |
      | 1        | accepted |
      | 10       | accepted |
      | 11       | rejected |
