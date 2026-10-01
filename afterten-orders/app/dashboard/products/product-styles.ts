/**
 * Single entry for product CSS module classes (one webpack chunk, fewer HMR misses).
 * Import from here instead of products.module.css directly.
 */
import styles from "./products.module.css";

export { styles as productStyles };
export default styles;
