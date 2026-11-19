import PDFDocument from 'pdfkit';
import { VendorOrder } from '../models/VendorOrder.js';
import { Order } from '../models/Order.js';
import { Vendor } from '../models/Vendor.js';
import { User } from '../models/User.js';

/**
 * Format currency in Indian format with "INR" prefix
 */
const formatINR = (val) => {
  const num = Number(val) || 0;
  return `INR ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format date in standard Indian format (e.g. 15 Nov 2026)
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Renders a single seller-wise tax invoice page on a PDFDocument
 */
const renderSuborderInvoicePage = (doc, vendorOrder, parentOrder, vendor, vendorUser, customerUser) => {
  // Determine State Tax Breakdown (CGST+SGST vs IGST)
  const sellerState = (vendor?.address?.state || '').trim().toLowerCase();
  const buyerState = (parentOrder.shippingAddress?.state || '').trim().toLowerCase();
  const isInterState = sellerState && buyerState && sellerState !== buyerState;
  const isIntraState = sellerState && buyerState && sellerState === buyerState;

  // Palette
  const primaryColor = '#1e293b'; // Slate 800
  const secondaryColor = '#475569'; // Slate 600
  const accentColor = '#4f46e5'; // Indigo 600
  const borderColor = '#cbd5e1'; // Slate 300
  const lightBg = '#f8fafc'; // Slate 50

  // Header: Branding & Document Type
  doc
    .fillColor(accentColor)
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('MarketSphere', 40, 40)
    .fontSize(9)
    .font('Helvetica')
    .fillColor(secondaryColor)
    .text('Multi-Vendor E-Commerce Marketplace (India)', 40, 65);

  doc
    .fillColor(primaryColor)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('TAX INVOICE', 350, 40, { align: 'right' })
    .fontSize(9)
    .font('Helvetica')
    .fillColor(secondaryColor)
    .text('ORIGINAL FOR RECIPIENT', 350, 60, { align: 'right' });

  // Divider Line
  doc.strokeColor(borderColor).lineWidth(1).moveTo(40, 85).lineTo(555, 85).stroke();

  // Meta Section: Invoice No, Date, Orders
  const invoiceNumber = `INV-${vendorOrder.vendorOrderNumber}`;
  const invoiceDate = formatDate(parentOrder.paidAt || vendorOrder.createdAt);

  doc.rect(40, 95, 515, 45).fill(lightBg).stroke(borderColor);

  doc
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Invoice Number:', 50, 103)
    .font('Helvetica')
    .text(invoiceNumber, 130, 103)
    .font('Helvetica-Bold')
    .text('Invoice Date:', 50, 120)
    .font('Helvetica')
    .text(invoiceDate, 130, 120);

  doc
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Parent Order Ref:', 320, 103)
    .font('Helvetica')
    .text(`#${parentOrder.orderNumber}`, 420, 103)
    .font('Helvetica-Bold')
    .text('Suborder Number:', 320, 120)
    .font('Helvetica')
    .text(vendorOrder.vendorOrderNumber, 420, 120);

  // Seller Details vs Buyer Details (Two Column Layout)
  const colY = 155;
  const colWidth = 250;

  // Seller Box (Left)
  doc
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('SOLD BY / SELLER DETAILS', 40, colY)
    .strokeColor(borderColor)
    .lineWidth(0.5)
    .moveTo(40, colY + 14)
    .lineTo(40 + colWidth, colY + 14)
    .stroke();

  const sellerName = vendor?.businessName || vendorUser?.name || 'Authorized Merchant';
  const sellerAddrStreet = vendor?.address?.street || 'Merchant Commercial Center';
  const sellerAddrCity = vendor?.address?.city || '';
  const sellerAddrState = vendor?.address?.state || '';
  const sellerAddrPin = vendor?.address?.postalCode || '';
  const sellerAddrCountry = vendor?.address?.country || 'India';
  const sellerGstin = vendor?.gstin || 'Unregistered / Exempt';
  const sellerPan = vendor?.pan || 'N/A';

  doc
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(sellerName, 40, colY + 22)
    .font('Helvetica')
    .fillColor(secondaryColor)
    .text(sellerAddrStreet, 40, colY + 34, { width: colWidth })
    .text(`${sellerAddrCity}${sellerAddrCity && sellerAddrState ? ', ' : ''}${sellerAddrState} - ${sellerAddrPin}`, 40, colY + 46)
    .text(`Country: ${sellerAddrCountry}`, 40, colY + 58)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text(`GSTIN: ${sellerGstin}`, 40, colY + 72)
    .text(`PAN: ${sellerPan}`, 40, colY + 84);

  // Buyer Box (Right)
  const buyerX = 305;
  doc
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('BILL TO / SHIP TO (CUSTOMER)', buyerX, colY)
    .strokeColor(borderColor)
    .lineWidth(0.5)
    .moveTo(buyerX, colY + 14)
    .lineTo(buyerX + colWidth, colY + 14)
    .stroke();

  const shipAddr = parentOrder.shippingAddress || {};
  const customerName = shipAddr.fullName || customerUser?.name || 'Customer';
  const customerPhone = shipAddr.phone || customerUser?.phone || 'N/A';
  const customerStreet = shipAddr.street || '';
  const customerCity = shipAddr.city || '';
  const customerState = shipAddr.state || '';
  const customerPin = shipAddr.postalCode || '';
  const customerCountry = shipAddr.country || 'India';

  doc
    .fillColor(primaryColor)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(customerName, buyerX, colY + 22)
    .font('Helvetica')
    .fillColor(secondaryColor)
    .text(customerStreet, buyerX, colY + 34, { width: colWidth })
    .text(`${customerCity}${customerCity && customerState ? ', ' : ''}${customerState} - ${customerPin}`, buyerX, colY + 46)
    .text(`Country: ${customerCountry} | Phone: ${customerPhone}`, buyerX, colY + 58)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('GSTIN: Consumer / B2C (Unregistered)', buyerX, colY + 72)
    .text(`Place of Supply: ${customerState || 'State not provided'}`, buyerX, colY + 84);

  // Table of Items
  const tableY = 265;
  doc.rect(40, tableY, 515, 20).fill(primaryColor);

  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('#', 45, tableY + 6)
    .text('ITEM DESCRIPTION', 65, tableY + 6)
    .text('QTY', 260, tableY + 6, { width: 30, align: 'center' })
    .text('UNIT PRICE', 300, tableY + 6, { width: 65, align: 'right' })
    .text('TAXABLE', 375, tableY + 6, { width: 55, align: 'right' })
    .text('GST %', 435, tableY + 6, { width: 40, align: 'center' })
    .text('TAX AMOUNT', 485, tableY + 6, { width: 65, align: 'right' });

  let rowY = tableY + 24;
  let itemIndex = 1;

  for (const item of vendorOrder.items) {
    const itemSubtotal = item.price * item.quantity;
    const itemTax = item.taxAmount || 0;
    const gstRate = item.gstRate !== undefined ? item.gstRate : 18;

    // Alternating row background
    if (itemIndex % 2 === 0) {
      doc.rect(40, rowY - 4, 515, 22).fill(lightBg);
    }

    doc
      .fillColor(primaryColor)
      .font('Helvetica')
      .fontSize(8)
      .text(`${itemIndex}`, 45, rowY)
      .font('Helvetica-Bold')
      .text(item.title.substring(0, 40), 65, rowY, { width: 190 })
      .font('Helvetica')
      .text(`${item.quantity}`, 260, rowY, { width: 30, align: 'center' })
      .text(formatINR(item.price).replace('INR ', ''), 300, rowY, { width: 65, align: 'right' })
      .text(formatINR(itemSubtotal).replace('INR ', ''), 375, rowY, { width: 55, align: 'right' })
      .text(`${gstRate}%`, 435, rowY, { width: 40, align: 'center' })
      .text(formatINR(itemTax).replace('INR ', ''), 485, rowY, { width: 65, align: 'right' });

    if (item.sku) {
      doc.fontSize(7).fillColor(secondaryColor).text(`SKU: ${item.sku}`, 65, rowY + 10);
      rowY += 24;
    } else {
      rowY += 18;
    }
    itemIndex++;
  }

  // Divider line after table
  doc.strokeColor(borderColor).lineWidth(1).moveTo(40, rowY).lineTo(555, rowY).stroke();

  // Summary Totals Section
  const summaryY = rowY + 15;

  // Tax Breakdown Sub-Table (Left)
  const taxBoxWidth = 260;
  doc
    .rect(40, summaryY, taxBoxWidth, 80)
    .fill(lightBg)
    .stroke(borderColor);

  doc
    .fillColor(accentColor)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('GST TAX BREAKDOWN (INR)', 50, summaryY + 8);

  const totalGst = vendorOrder.taxAmount || 0;

  if (isIntraState) {
    const halfTax = Math.round((totalGst / 2) * 100) / 100;
    doc
      .font('Helvetica')
      .fillColor(primaryColor)
      .fontSize(8)
      .text('Intra-State Supply (CGST + SGST)', 50, summaryY + 24)
      .text(`Central GST (CGST):`, 50, summaryY + 40)
      .text(formatINR(halfTax), 180, summaryY + 40, { align: 'right', width: 110 })
      .text(`State GST (SGST):`, 50, summaryY + 54)
      .text(formatINR(halfTax), 180, summaryY + 54, { align: 'right', width: 110 })
      .text(`Integrated GST (IGST):`, 50, summaryY + 68)
      .text('INR 0.00 (N/A)', 180, summaryY + 68, { align: 'right', width: 110 });
  } else if (isInterState) {
    doc
      .font('Helvetica')
      .fillColor(primaryColor)
      .fontSize(8)
      .text('Inter-State Supply (IGST Applicable)', 50, summaryY + 24)
      .text(`Central GST (CGST):`, 50, summaryY + 40)
      .text('INR 0.00 (N/A)', 180, summaryY + 40, { align: 'right', width: 110 })
      .text(`State GST (SGST):`, 50, summaryY + 54)
      .text('INR 0.00 (N/A)', 180, summaryY + 54, { align: 'right', width: 110 })
      .text(`Integrated GST (IGST):`, 50, summaryY + 68)
      .text(formatINR(totalGst), 180, summaryY + 68, { align: 'right', width: 110 });
  } else {
    doc
      .font('Helvetica')
      .fillColor(primaryColor)
      .fontSize(8)
      .text('Applicable Product GST:', 50, summaryY + 28)
      .text(`Total GST Amount:`, 50, summaryY + 48)
      .text(formatINR(totalGst), 180, summaryY + 48, { align: 'right', width: 110 })
      .font('Helvetica-Oblique')
      .fontSize(7)
      .fillColor(secondaryColor)
      .text('(State breakdown based on shipping address)', 50, summaryY + 64);
  }

  // Totals Box (Right)
  const totalX = 330;
  const labelWidth = 110;
  const valWidth = 110;
  const valX = 440;

  doc
    .font('Helvetica')
    .fillColor(secondaryColor)
    .fontSize(9)
    .text('Taxable Items Subtotal:', totalX, summaryY + 8)
    .text(formatINR(vendorOrder.subtotal), valX, summaryY + 8, { width: valWidth, align: 'right' })
    .text('Shipping & Handling:', totalX, summaryY + 24)
    .text(formatINR(vendorOrder.shippingFee || 0), valX, summaryY + 24, { width: valWidth, align: 'right' })
    .text('Applicable GST Tax:', totalX, summaryY + 40)
    .text(formatINR(vendorOrder.taxAmount), valX, summaryY + 40, { width: valWidth, align: 'right' });

  // Total Payable Highlight Box
  doc
    .rect(totalX - 10, summaryY + 58, 235, 26)
    .fill('#ecfdf5')
    .stroke('#059669');

  doc
    .fillColor('#065f46')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('INVOICE TOTAL:', totalX, summaryY + 66)
    .text(formatINR(vendorOrder.vendorTotal), valX, summaryY + 66, { width: valWidth, align: 'right' });

  // Payment Status & Method Info
  const payStatusY = summaryY + 105;
  const paymentMethodDisplay = (parentOrder.paymentMethod || 'Razorpay').toUpperCase();
  const paymentStatusDisplay = (parentOrder.paymentStatus || 'PENDING').toUpperCase();

  doc
    .rect(40, payStatusY, 515, 26)
    .fill(lightBg)
    .stroke(borderColor);

  doc
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .fontSize(8)
    .text(`PAYMENT METHOD: ${paymentMethodDisplay}`, 50, payStatusY + 9)
    .text(`PAYMENT STATUS: ${paymentStatusDisplay}`, 220, payStatusY + 9)
    .text(`DELIVERY STATUS: ${(vendorOrder.orderStatus || 'PLACED').toUpperCase()}`, 380, payStatusY + 9);

  // Footer / Disclaimer
  const footerY = 700;
  doc
    .strokeColor(borderColor)
    .lineWidth(0.5)
    .moveTo(40, footerY)
    .lineTo(555, footerY)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .fontSize(8)
    .text('Declaration & Terms:', 40, footerY + 8)
    .font('Helvetica')
    .fillColor(secondaryColor)
    .fontSize(7)
    .text(
      'This is an electronically generated Tax Invoice issued by the merchant seller pursuant to the CGST/SGST Act, 2017. ' +
        'MarketSphere operates as an intermediary e-commerce marketplace platform connecting consumers and registered merchants.',
      40,
      footerY + 18,
      { width: 350 }
    );

  // Authorized Signatory Box (Right)
  doc
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .fontSize(8)
    .text(`For ${sellerName}:`, 420, footerY + 8, { align: 'right' })
    .font('Helvetica-Oblique')
    .fontSize(7)
    .fillColor(secondaryColor)
    .text('Authorized Signatory', 420, footerY + 38, { align: 'right' })
    .text('(Digitally Signed)', 420, footerY + 48, { align: 'right' });
};

/**
 * Builds Tax Invoice PDF for a single vendor suborder
 */
export const buildVendorOrderInvoicePDF = async (vendorOrderId, requestingUser, outputStream) => {
  const vendorOrder = await VendorOrder.findById(vendorOrderId);
  if (!vendorOrder) {
    const err = new Error('Vendor suborder not found');
    err.status = 404;
    throw err;
  }

  const parentOrder = await Order.findById(vendorOrder.parentOrderId);
  if (!parentOrder) {
    const err = new Error('Associated parent order not found');
    err.status = 404;
    throw err;
  }

  const isCustomer = requestingUser.role === 'customer' || requestingUser.role === undefined;
  const isVendor = requestingUser.role === 'vendor';

  if (isCustomer && vendorOrder.customerId.toString() !== requestingUser._id.toString()) {
    const err = new Error('Not authorized to access invoice for this order');
    err.status = 403;
    throw err;
  }

  if (isVendor && vendorOrder.vendorId.toString() !== requestingUser._id.toString()) {
    const err = new Error('Not authorized to access invoice for another vendor');
    err.status = 403;
    throw err;
  }

  const vendor = await Vendor.findOne({ userId: vendorOrder.vendorId });
  const vendorUser = await User.findById(vendorOrder.vendorId);
  const customerUser = await User.findById(vendorOrder.customerId);

  const filename = `Invoice-${vendorOrder.vendorOrderNumber}.pdf`;

  if (typeof outputStream.setHeader === 'function') {
    outputStream.setHeader('Content-Type', 'application/pdf');
    outputStream.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: {
      Title: `Tax Invoice - ${vendorOrder.vendorOrderNumber}`,
      Author: 'MarketSphere Platform',
      Subject: `Tax Invoice for Suborder ${vendorOrder.vendorOrderNumber}`,
    },
  });

  doc.pipe(outputStream);
  renderSuborderInvoicePage(doc, vendorOrder, parentOrder, vendor, vendorUser, customerUser);
  doc.end();

  return {
    vendorOrderNumber: vendorOrder.vendorOrderNumber,
    filename,
  };
};

/**
 * Builds Tax Invoice PDF for a parent order.
 * If parent order has 1 vendor suborder: generates single-page tax invoice.
 * If parent order has multiple vendor suborders: generates multi-page document with one invoice per vendor.
 */
export const buildParentOrderInvoicePDF = async (parentOrderId, requestingUser, outputStream, specificSuborderId = null) => {
  const parentOrder = await Order.findById(parentOrderId);
  if (!parentOrder) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  const isCustomer = requestingUser.role === 'customer' || requestingUser.role === undefined;
  const isVendor = requestingUser.role === 'vendor';

  if (isCustomer && parentOrder.customerId.toString() !== requestingUser._id.toString()) {
    const err = new Error('Not authorized to access invoice for this order');
    err.status = 403;
    throw err;
  }

  let suborderQuery = { parentOrderId: parentOrder._id };
  if (specificSuborderId) {
    suborderQuery._id = specificSuborderId;
  } else if (isVendor) {
    suborderQuery.vendorId = requestingUser._id;
  }

  const suborders = await VendorOrder.find(suborderQuery);
  if (suborders.length === 0) {
    const err = new Error(isVendor ? 'No suborders found for your store in this order' : 'No vendor suborders found for this order');
    err.status = 404;
    throw err;
  }

  const customerUser = await User.findById(parentOrder.customerId);

  const filename =
    suborders.length === 1
      ? `Invoice-${suborders[0].vendorOrderNumber}.pdf`
      : `Invoices-Order-${parentOrder.orderNumber}.pdf`;

  if (typeof outputStream.setHeader === 'function') {
    outputStream.setHeader('Content-Type', 'application/pdf');
    outputStream.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: {
      Title: `Tax Invoice - Order ${parentOrder.orderNumber}`,
      Author: 'MarketSphere Platform',
      Subject: `Tax Invoice for Order ${parentOrder.orderNumber}`,
    },
  });

  doc.pipe(outputStream);

  for (let i = 0; i < suborders.length; i++) {
    if (i > 0) {
      doc.addPage();
    }
    const vo = suborders[i];
    const vendor = await Vendor.findOne({ userId: vo.vendorId });
    const vendorUser = await User.findById(vo.vendorId);
    renderSuborderInvoicePage(doc, vo, parentOrder, vendor, vendorUser, customerUser);
  }

  doc.end();

  return {
    orderNumber: parentOrder.orderNumber,
    suborderCount: suborders.length,
    filename,
  };
};
