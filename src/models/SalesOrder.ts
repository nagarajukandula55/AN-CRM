/**
 * SalesOrder — alias for the Order model
 * The finance/invoices route imports "@/models/SalesOrder".
 * This bridge re-exports Order.
 */
import Order from "./Order";

export default Order;
