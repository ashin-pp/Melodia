import mongoose from 'mongoose';
import Order from '../../model/orderSchema.js';
import User from '../../model/userSchema.js';
import Product from '../../model/productSchema.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

// Helper function to get date filter (matching your dashboard structure)
function getDateFilter(period, year, month, startDate, endDate) {
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
        return {
            orderDate: {
                $gte: new Date(startDate),
                $lte: new Date(endDate + 'T23:59:59.999Z')
            }
        };
    }

    switch (period) {
        case 'yearly':
            const yearToUse = year || now.getFullYear();
            dateFilter = {
                orderDate: {
                    $gte: new Date(yearToUse, 0, 1),
                    $lte: new Date(yearToUse, 11, 31, 23, 59, 59)
                }
            };
            break;
        case 'monthly':
            const yearForMonth = year || now.getFullYear();
            const monthToUse = month || (now.getMonth() + 1);
            dateFilter = {
                orderDate: {
                    $gte: new Date(yearForMonth, monthToUse - 1, 1),
                    $lte: new Date(yearForMonth, monthToUse, 0, 23, 59, 59)
                }
            };
            break;
        case 'weekly':
            const currentDate = new Date();
            const weekStart = new Date(currentDate);
            weekStart.setDate(currentDate.getDate() - currentDate.getDay());
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
            dateFilter = {
                orderDate: { $gte: weekStart, $lte: weekEnd }
            };
            break;
        default: // daily
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateFilter = {
                orderDate: { $gte: today, $lt: tomorrow }
            };
    }
    return dateFilter;
}

// Render sales report page
export const getSalesReportPage = async (req, res) => {
    try {
        res.render('admin/sales-report', {
            title: 'Sales Report',
            currentPage: 'sales'
        });
    } catch (error) {
        console.error('Error rendering sales report page:', error);
        res.status(500).render('admin/error', {
            message: 'Error loading sales report page'
        });
    }
};

// Generate ledger (matching your dashboard structure)
// export const generateLedger = async (req, res) => {
//     try {
//         const { startDate, endDate } = req.query;

//         if (!startDate || !endDate) {
//             return res.status(400).json({
//                 error: 'BAD_REQUEST',
//                 message: 'Start date and end date are required'
//             });
//         }

//         const ledgerData = await Order.aggregate([
//             {
//                 $match: {
//                     createdAt: {
//                         $gte: new Date(startDate),
//                         $lte: new Date(endDate)
//                     },
//                     status: { $ne: 'Cancelled' }
//                 }
//             },
//             {
//                 $group: {
//                     _id: {
//                         date: {
//                             $dateToString: {
//                                 format: "%Y-%m-%d",
//                                 date: "$createdAt"
//                             }
//                         }
//                     },
//                     totalSales: { $sum: "$total" },
//                     totalOrders: { $sum: 1 },
//                     orders: { $push: "$$ROOT" }
//                 }
//             },
//             { $sort: { "_id.date": 1 } }
//         ]);

//         const doc = new PDFDocument({
//             margin: 50,
//             bufferPages: true
//         });

//         res.setHeader('Content-Type', 'application/pdf');
//         res.setHeader('Content-Disposition', `attachment; filename=ledger_${startDate}_to_${endDate}.pdf`);

//         doc.pipe(res);

//         const pageHeight = doc.page.height;
//         const margin = 50;
//         const bottomMargin = pageHeight - margin;

//         // Header
//         doc.fontSize(24).font('Helvetica-Bold')
//             .text('MELODIA - LEDGER BOOK', { align: 'center' });
//         doc.fontSize(14).font('Helvetica')
//             .text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
//         doc.moveDown(2);

//         // Summary
//         const grandTotal = ledgerData.reduce((sum, day) => sum + day.totalSales, 0);
//         const totalOrdersCount = ledgerData.reduce((sum, day) => sum + day.totalOrders, 0);

//         doc.fontSize(16).font('Helvetica-Bold').text('SUMMARY', { underline: true });
//         doc.moveDown(0.5);
//         doc.fontSize(12).font('Helvetica');
//         doc.text('Total Revenue:', 50, doc.y);
//         doc.text(`Rs ${grandTotal.toLocaleString('en-IN')}`, 200, doc.y - 12);
//         doc.text('Total Orders:', 50, doc.y);
//         doc.text(`${totalOrdersCount}`, 200, doc.y - 12);
//         doc.moveDown(2);

//         // Daily breakdown
//         doc.fontSize(16).font('Helvetica-Bold').text('DAILY BREAKDOWN', { underline: true });
//         doc.moveDown(1);

//         ledgerData.forEach((day) => {
//             const ordersCount = day.orders.length;
//             const spaceNeeded = 80 + (ordersCount * 20) + 25;

//             if (doc.y + spaceNeeded > bottomMargin) {
//                 doc.addPage();
//             }

//             // Day header
//             const dayHeaderY = doc.y;
//             doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb')
//                 .text(`${day._id.date}`, 50, dayHeaderY);
//             doc.fontSize(10).font('Helvetica').fillColor('#666666')
//                 .text(`Daily Total: Rs ${day.totalSales.toLocaleString('en-IN')} | Orders: ${day.totalOrders}`, 200, dayHeaderY);
//             doc.moveDown(0.5);

//             // Table header
//             const tableTop = doc.y;
//             const orderNoX = 50;
//             const referenceX = 120;
//             const statusX = 220;
//             const amountX = 300;
//             const customerX = 380;

//             doc.rect(50, tableTop - 5, 492, 25).fillAndStroke('#f3f4f6', '#d1d5db');
//             doc.fontSize(10).font('Helvetica-Bold').fillColor('#374151');
//             doc.text('S.No', orderNoX, tableTop);
//             doc.text('Order Ref', referenceX, tableTop);
//             doc.text('Status', statusX, tableTop);
//             doc.text('Amount (Rs)', amountX, tableTop);
//             doc.text('Customer', customerX, tableTop);
//             doc.y = tableTop + 25;

//             // Order rows
//             day.orders.forEach((order, orderIndex) => {
//                 const currentY = doc.y;
//                 if (orderIndex % 2 === 0) {
//                     doc.rect(50, currentY - 3, 492, 20).fill('#f9fafb');
//                 }

//                 doc.fontSize(9).font('Helvetica').fillColor('#111827');
//                 doc.text(`${orderIndex + 1}`, orderNoX, currentY);
//                 doc.text(order.referenceNo || 'N/A', referenceX, currentY);

//                 const statusColor = getStatusColor(order.status);
//                 doc.fillColor(statusColor).text(order.status, statusX, currentY);
//                 doc.fillColor('#111827').text(order.total.toLocaleString('en-IN'), amountX, currentY);

//                 const customerName = order.address?.name || 'Guest';
//                 const truncatedName = customerName.length > 15 ? customerName.substring(0, 15) + '...' : customerName;
//                 doc.text(truncatedName, customerX, currentY);
//                 doc.y = currentY + 20;
//             });

//             // Daily total row
//             const totalRowY = doc.y;
//             doc.rect(50, totalRowY, 492, 25).fillAndStroke('#e5e7eb', '#9ca3af');
//             doc.fontSize(10).font('Helvetica-Bold').fillColor('#1f2937');
//             doc.text('Daily Total:', referenceX, totalRowY + 5);
//             doc.text(`Rs ${day.totalSales.toLocaleString('en-IN')}`, amountX, totalRowY + 5);
//             doc.text(`${day.totalOrders} orders`, customerX, totalRowY + 5);
//             doc.y = totalRowY + 35;
//         });

//         // Grand total
//         if (doc.y + 60 > bottomMargin) {
//             doc.addPage();
//         }

//         const grandTotalY = doc.y + 10;
//         doc.rect(50, grandTotalY, 492, 30).fillAndStroke('#1f2937', '#111827');
//         doc.fontSize(14).font('Helvetica-Bold').fillColor('#ffffff');
//         doc.text('GRAND TOTAL:', 200, grandTotalY + 8);
//         doc.text(`Rs ${grandTotal.toLocaleString('en-IN')}`, 300, grandTotalY + 8);
//         doc.text(`${totalOrdersCount} Total Orders`, 380, grandTotalY + 8);

//         // Footer
//         doc.fontSize(8).fillColor('#6b7280')
//             .text(`Generated on: ${new Date().toLocaleString('en-IN')} | Melodia Admin Panel`,
//                 50, doc.page.height - 30, { align: 'center' });

//         doc.end();

//     } catch (error) {
//         console.error('Ledger generation error:', error);
//         res.status(500).json({
//             error: 'INTERNAL_ERROR',
//             message: 'Failed to generate ledger'
//         });
//     }
// };

// Helper function for status colors (matching your dashboard)
function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'delivered':
            return '#10b981'; // green
        case 'shipped':
        case 'out for delivery':
            return '#3b82f6'; // blue
        case 'cancelled':
            return '#ef4444'; // red
        case 'pending':
            return '#f59e0b'; // yellow
        case 'confirmed':
        case 'processing':
            return '#8b5cf6'; // purple
        default:
            return '#6b7280'; // gray
    }
}

// Get sales report data
export const getSalesReportData = async (req, res) => {
    try {
        const { period = 'monthly', startDate, endDate, year, month } = req.query;

        // Use the same date filter function as dashboard
        const dateFilter = getDateFilter(period, parseInt(year), parseInt(month), startDate, endDate);

        // Get orders with filters (using correct field names from schema)
        const orders = await Order.find({
            ...dateFilter,
            orderStatus: { $ne: 'Cancelled' } // Using 'orderStatus' field from schema
        })
            .populate('userId', 'firstName lastName name email') // Using correct user fields
            .populate('items.variantId') // Using 'items' field from schema
            .sort({ orderDate: -1 }); // Using 'orderDate' from schema

        // Calculate summary statistics (using correct field names from schema)
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0); // Using 'totalAmount' field
        const totalOfferDiscount = orders.reduce((sum, order) => sum + (order.offerDiscount || 0), 0);
        const totalCouponDiscount = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const totalGeneralDiscount = orders.reduce((sum, order) => sum + (order.discountAmount || 0), 0);
        const totalWalletUsed = orders.reduce((sum, order) => sum + (order.walletAmountUsed || 0), 0);
        const totalDiscount = totalOfferDiscount + totalCouponDiscount + totalGeneralDiscount;
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;



        // Get payment method breakdown
        const paymentMethodStats = {};
        orders.forEach(order => {
            const method = order.paymentMethod || 'Unknown';
            if (!paymentMethodStats[method]) {
                paymentMethodStats[method] = { count: 0, amount: 0 };
            }
            paymentMethodStats[method].count++;
            paymentMethodStats[method].amount += (order.totalAmount || 0); // Using 'totalAmount' field
        });

        // Get top products with proper product details
        const topProducts = await Order.aggregate([
            { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'variants',
                    localField: 'items.variantId',
                    foreignField: '_id',
                    as: 'variant'
                }
            },
            { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'products',
                    localField: 'variant.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$items.variantId',
                    productName: {
                        $first: {
                            $ifNull: ['$product.productName', '$items.productName', 'Unknown Product']
                        }
                    },
                    brand: {
                        $first: {
                            $ifNull: ['$product.brand', 'Unknown Brand']
                        }
                    },
                    color: {
                        $first: {
                            $ifNull: ['$variant.color', 'N/A']
                        }
                    },
                    quantity: { $sum: '$items.quantity' },
                    revenue: { $sum: '$items.totalPrice' }
                }
            },
            { $sort: { quantity: -1 } },
            { $limit: 10 },
            {
                $project: {
                    productName: 1,
                    brand: 1,
                    color: 1,
                    quantity: 1,
                    revenue: 1
                }
            }
        ]);


        // Calculate gross revenue (revenue before discounts)
        const grossRevenue = totalRevenue + totalDiscount;

        // Create comprehensive summary with proper discount calculation
        const finalSummary = {
            totalOrders,
            totalRevenue,
            grossRevenue,
            totalOfferDiscount,
            totalCouponDiscount,
            totalGeneralDiscount,
            totalDiscount,
            totalWalletUsed,
            averageOrderValue,
            minOrderValue: orders.length > 0 ? Math.min(...orders.map(o => o.totalAmount || 0)) : 0,
            maxOrderValue: orders.length > 0 ? Math.max(...orders.map(o => o.totalAmount || 0)) : 0,
            discountPercentage: grossRevenue > 0 ? ((totalDiscount / grossRevenue) * 100) : 0,
            walletPercentage: totalRevenue > 0 ? ((totalWalletUsed / totalRevenue) * 100) : 0,
            // Additional metrics for better insights
            totalSalesAmount: totalRevenue,
            totalProductOffers: totalOfferDiscount,
            totalCouponDiscounts: totalCouponDiscount,
            totalDiscounts: totalDiscount,
            netRevenue: totalRevenue - totalDiscount
        };



        // Get customer analytics
        const topCustomers = await Order.aggregate([
            { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
            {
                $group: {
                    _id: '$userId',
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$totalAmount' }
                }
            },
            { $match: { _id: { $ne: null } } },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    customerName: {
                        $ifNull: ['$user.name', 'Guest Customer']
                    },
                    email: { $ifNull: ['$user.email', 'N/A'] },
                    orderCount: 1,
                    totalSpent: 1
                }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 }
        ]);

        // Get order status breakdown
        const orderStatusStats = {};
        orders.forEach(order => {
            const status = order.orderStatus || 'Unknown'; // Using 'orderStatus' field
            if (!orderStatusStats[status]) {
                orderStatusStats[status] = { count: 0, amount: 0 };
            }
            orderStatusStats[status].count++;
            orderStatusStats[status].amount += (order.totalAmount || 0); // Using 'totalAmount' field
        });

        // Get chart data based on period
        let groupBy = {};
        let sortBy = {};

        switch (period) {
            case 'daily':
                groupBy = {
                    year: { $year: '$orderDate' },
                    month: { $month: '$orderDate' },
                    day: { $dayOfMonth: '$orderDate' }
                };
                sortBy = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
                break;
            case 'weekly':
                groupBy = {
                    year: { $year: '$orderDate' },
                    week: { $week: '$orderDate' }
                };
                sortBy = { '_id.year': 1, '_id.week': 1 };
                break;
            case 'monthly':
                groupBy = {
                    year: { $year: '$orderDate' },
                    month: { $month: '$orderDate' }
                };
                sortBy = { '_id.year': 1, '_id.month': 1 };
                break;
            case 'yearly':
                groupBy = {
                    year: { $year: '$orderDate' }
                };
                sortBy = { '_id.year': 1 };
                break;
            default: // custom or daily
                groupBy = {
                    year: { $year: '$orderDate' },
                    month: { $month: '$orderDate' },
                    day: { $dayOfMonth: '$orderDate' }
                };
                sortBy = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
        }

        const salesChartData = await Order.aggregate([
            {
                $match: {
                    ...dateFilter,
                    orderStatus: { $in: ['Delivered', 'Shipped', 'Processing'] } // Include successful orders
                }
            },
            {
                $group: {
                    _id: groupBy,
                    totalSales: {
                        $sum: {
                            $cond: [
                                // If wallet payment and totalAmount is 0, use walletAmountUsed
                                {
                                    $and: [
                                        { $eq: ['$paymentMethod', 'WALLET'] },
                                        { $eq: ['$totalAmount', 0] },
                                        { $gt: ['$walletAmountUsed', 0] }
                                    ]
                                },
                                '$walletAmountUsed',
                                {
                                    $cond: [
                                        { $gt: ['$totalAmount', 0] },
                                        '$totalAmount',
                                        0
                                    ]
                                }
                            ]
                        }
                    },
                    orderCount: { $sum: 1 },
                    totalDiscount: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$offerDiscount', 0] },
                                { $ifNull: ['$couponDiscount', 0] },
                                { $ifNull: ['$discountAmount', 0] }
                            ]
                        }
                    }
                }
            },
            { $sort: sortBy }
        ]);



        // Format chart data for frontend
        // Format chart data for frontend based on period
        let formattedChartData = salesChartData.map(item => {
            let dateLabel = '';
            let dateValue = '';

            switch (period) {
                case 'daily':
                    if (item._id.day) {
                        dateLabel = `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`;
                        dateValue = dateLabel;
                    } else {
                        dateLabel = `${item._id.year}-${String(item._id.month).padStart(2, '0')}-01`;
                        dateValue = dateLabel;
                    }
                    break;
                case 'weekly':
                    dateLabel = `Week ${item._id.week || 1}, ${item._id.year}`;
                    dateValue = `${item._id.year}-W${String(item._id.week || 1).padStart(2, '0')}`;
                    break;
                case 'monthly':
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    dateLabel = `${monthNames[(item._id.month || 1) - 1]} ${item._id.year}`;
                    dateValue = `${item._id.year}-${String(item._id.month || 1).padStart(2, '0')}`;
                    break;
                case 'yearly':
                    dateLabel = `${item._id.year}`;
                    dateValue = `${item._id.year}`;
                    break;
                default:
                    dateLabel = `${item._id.year}-${String(item._id.month || 1).padStart(2, '0')}-${String(item._id.day || 1).padStart(2, '0')}`;
                    dateValue = dateLabel;
            }

            return {
                date: dateValue,
                label: dateLabel,
                sales: item.totalSales || 0,
                orders: item.orderCount || 0,
                discount: item.totalDiscount || 0
            };
        });

        // Always use real data - no sample data fallback

        // Ensure all values are positive and properly formatted
        formattedChartData = formattedChartData.map(item => ({
            ...item,
            sales: Math.max(0, item.sales || 0),
            orders: Math.max(0, item.orders || 0),
            discount: Math.max(0, item.discount || 0)
        }));

        // Sort by date to ensure proper chronological order
        formattedChartData.sort((a, b) => new Date(a.date) - new Date(b.date));




        // Get category performance data
        const topCategories = await Order.aggregate([
            { $match: { ...dateFilter, orderStatus: { $ne: 'Cancelled' } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            { $unwind: '$productInfo' },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'productInfo.categoryId',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            {
                $group: {
                    _id: '$categoryInfo._id',
                    name: { $first: '$categoryInfo.name' },
                    sales: { $sum: '$items.totalPrice' },
                    orders: { $sum: 1 },
                    quantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { sales: -1 } },
            { $limit: 5 }
        ]);

        res.json({
            success: true,
            data: {
                summary: finalSummary,
                paymentMethodStats,
                orderStatusStats,
                topProducts: topProducts || [],
                topCustomers: topCustomers || [],
                topCategories: topCategories || [],
                chartData: formattedChartData || [],
                orders: orders.slice(0, 50),
                filters: { period, startDate, endDate, year, month },
                pagination: {
                    currentPage: 1,
                    totalPages: Math.ceil(orders.length / 50),
                    totalOrders: orders.length,
                    limit: 50
                }
            }
        });
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating sales report'
        });
    }
};

// Download sales report as Excel
export const downloadExcelReport = async (req, res) => {
    try {
        const { period = 'monthly', startDate, endDate } = req.query;

        // Get the same data as the main report
        const reportData = await getSalesReportDataInternal(period, startDate, endDate);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // Add title
        worksheet.mergeCells('A1:H1');
        worksheet.getCell('A1').value = `Sales Report - ${period.charAt(0).toUpperCase() + period.slice(1)}`;
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        // Add date range
        if (startDate && endDate) {
            worksheet.mergeCells('A2:H2');
            worksheet.getCell('A2').value = `Period: ${startDate} to ${endDate}`;
            worksheet.getCell('A2').alignment = { horizontal: 'center' };
        }

        // Enhanced summary section
        let currentRow = 4;
        worksheet.getCell(`A${currentRow}`).value = 'SUMMARY';
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;

        const summaryData = [
            ['Total Orders', reportData.summary.totalOrders || 0],
            ['Total Sales Amount', `₹${(reportData.summary.totalSalesAmount || reportData.summary.totalRevenue || 0).toFixed(2)}`],
            ['Total Product Offers', `₹${(reportData.summary.totalProductOffers || reportData.summary.totalOfferDiscount || 0).toFixed(2)}`],
            ['Total Coupon Discounts', `₹${(reportData.summary.totalCouponDiscounts || reportData.summary.totalCouponDiscount || 0).toFixed(2)}`],
            ['Total Discounts', `₹${(reportData.summary.totalDiscounts || reportData.summary.totalDiscount || 0).toFixed(2)}`],
            ['Average Order Value', `₹${(reportData.summary.averageOrderValue || 0).toFixed(2)}`],
            ['Min Order Value', `₹${(reportData.summary.minOrderValue || 0).toFixed(2)}`],
            ['Max Order Value', `₹${(reportData.summary.maxOrderValue || 0).toFixed(2)}`],
            ['Discount Percentage', `${(reportData.summary.discountPercentage || 0).toFixed(2)}%`]
        ];

        summaryData.forEach(([label, value]) => {
            worksheet.getCell(`A${currentRow}`).value = label;
            worksheet.getCell(`B${currentRow}`).value = value;
            currentRow++;
        });

        // Add orders section
        currentRow += 2;
        worksheet.getCell(`A${currentRow}`).value = 'ORDERS DETAIL';
        worksheet.getCell(`A${currentRow}`).font = { bold: true };
        currentRow++;

        // Enhanced headers
        const headers = ['Order ID', 'Reference No', 'Date', 'Customer', 'Status', 'Payment Method', 'Subtotal', 'Product Offers', 'Coupon Discount', 'Total Amount', 'Items Count'];
        headers.forEach((header, index) => {
            const cell = worksheet.getCell(currentRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        });
        currentRow++;

        // Enhanced data rows with correct field names
        reportData.orders.forEach(order => {
            // Fix customer name field mapping
            const customerName = order.userId ?
                (order.userId.firstName ? `${order.userId.firstName} ${order.userId.lastName || ''}`.trim() : order.userId.name || 'N/A') :
                'Guest Customer';

            const subtotal = (order.totalAmount || order.total || 0) + (order.offerDiscount || 0) + (order.couponDiscount || 0);
            const productOffers = order.productOffers || order.offerDiscount || 0;
            const couponDiscount = order.couponDiscount || 0;
            const orderRef = order.orderId || order.referenceNo || order._id.toString().slice(-8);

            worksheet.getCell(currentRow, 1).value = orderRef;
            worksheet.getCell(currentRow, 2).value = order.orderId || order.referenceNo || 'N/A';
            worksheet.getCell(currentRow, 3).value = (order.orderDate || order.createdAt)?.toLocaleDateString() || '';
            worksheet.getCell(currentRow, 4).value = customerName;
            worksheet.getCell(currentRow, 5).value = order.orderStatus || order.status || 'N/A';
            worksheet.getCell(currentRow, 6).value = order.paymentMethod || 'N/A';
            worksheet.getCell(currentRow, 7).value = subtotal || 0;
            worksheet.getCell(currentRow, 8).value = productOffers;
            worksheet.getCell(currentRow, 9).value = couponDiscount;
            worksheet.getCell(currentRow, 10).value = order.totalAmount || order.total || 0;
            worksheet.getCell(currentRow, 11).value = order.items?.length || 0;
            currentRow++;
        });

        // Auto-fit columns
        worksheet.columns.forEach(column => {
            column.width = 15;
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${period}-${Date.now()}.xlsx`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating Excel report'
        });
    }
};

// Download sales report as PDF
export const downloadPDFReport = async (req, res) => {
    try {
        const { period = 'monthly', startDate, endDate, type } = req.query;

        // Get the same data as the main report
        const reportData = await getSalesReportDataInternal(period, startDate, endDate);

        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=sales-report-${period}-${Date.now()}.pdf`);

        // Pipe PDF to response
        doc.pipe(res);

        // Add title based on type
        if (type === 'ledger') {
            // Use the full ledger generation function for ledger type
            return generateLedger(req, res);
        } else {
            doc.fontSize(20).text(`Sales Report - ${period.charAt(0).toUpperCase() + period.slice(1)}`, { align: 'center' });
            if (startDate && endDate) {
                doc.fontSize(12).text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
            }
        }

        doc.moveDown(2);

        // Add summary section
        doc.fontSize(16).text('Summary', { underline: true });
        doc.moveDown();

        doc.fontSize(12);
        doc.text(`Total Orders: ${reportData.summary.totalOrders}`);
        doc.text(`Gross Revenue: ₹${reportData.summary.grossRevenue.toFixed(2)}`);
        doc.text(`Total Discounts: ₹${reportData.summary.totalDiscount.toFixed(2)}`);
        doc.text(`Net Revenue: ₹${reportData.summary.totalRevenue.toFixed(2)}`);
        doc.text(`Average Order Value: ₹${reportData.summary.averageOrderValue.toFixed(2)}`);
        doc.text(`Wallet Used: ₹${reportData.summary.totalWalletUsed.toFixed(2)}`);

        doc.moveDown(2);

        // Add orders section
        doc.fontSize(16).text('Recent Orders', { underline: true });
        doc.moveDown();

        doc.fontSize(10);
        reportData.orders.slice(0, 20).forEach(order => {
            // Fix field names to match your order schema
            const customerName = order.userId ?
                (order.userId.firstName ? `${order.userId.firstName} ${order.userId.lastName || ''}`.trim() : order.userId.name || 'N/A') :
                'Guest Customer';

            const totalDiscount = (order.offerDiscount || 0) + (order.couponDiscount || 0) + (order.discountAmount || 0);
            const orderDate = order.orderDate || order.createdAt;
            const orderRef = order.orderId || order.referenceNo || order._id.toString().slice(-8);
            const orderTotal = order.totalAmount || order.total || 0;

            doc.text(`${orderRef} | ${orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'} | ${customerName} | ₹${orderTotal.toFixed(2)} | Discount: ₹${totalDiscount.toFixed(2)}`);
        });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating PDF report'
        });
    }
};

// Internal function to get report data (reusable)
const getSalesReportDataInternal = async (period, startDate, endDate) => {
    // Use the same date filter function
    const dateFilter = getDateFilter(period, null, null, startDate, endDate);

    // Get orders (matching your field structure)
    const orders = await Order.find({
        ...dateFilter,
        orderStatus: { $ne: 'Cancelled' }
    })
        .populate('userId', 'firstName lastName name email')
        .sort({ orderDate: -1 });

    // Calculate summary (using correct field names)
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOfferDiscount = orders.reduce((sum, order) => sum + (order.offerDiscount || 0), 0);
    const totalCouponDiscount = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
    const totalGeneralDiscount = orders.reduce((sum, order) => sum + (order.discountAmount || 0), 0);
    const totalDiscount = totalOfferDiscount + totalCouponDiscount + totalGeneralDiscount;
    const totalWalletUsed = 0;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const grossRevenue = totalRevenue + totalDiscount;

    return {
        summary: {
            totalOrders,
            totalRevenue,
            grossRevenue,
            totalOfferDiscount,
            totalCouponDiscount,
            totalDiscount,
            totalWalletUsed,
            averageOrderValue
        },
        orders
    };
};



export const generateSalesReport = async (req, res) => {
    try {
        const { period = 'monthly', startDate, endDate } = req.query;

        let dateFilter = {};
        const now = new Date();

        switch (period) {
            case 'daily':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                dateFilter = { orderDate: { $gte: today, $lt: tomorrow } };
                break;

            case 'weekly':
                const weekStart = new Date();
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                weekStart.setHours(0, 0, 0, 0);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                dateFilter = { orderDate: { $gte: weekStart, $lt: weekEnd } };
                break;

            case 'monthly':
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                dateFilter = { orderDate: { $gte: monthStart, $lt: monthEnd } };
                break;

            case 'yearly':
                const yearStart = new Date(now.getFullYear(), 0, 1);
                const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
                dateFilter = { orderDate: { $gte: yearStart, $lt: yearEnd } };
                break;

            case 'custom':
                if (startDate && endDate) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);

                    if (start >= end) {
                        return res.json({
                            success: false,
                            message: 'End date must be after start date'
                        });
                    }

                    dateFilter = {
                        orderDate: {
                            $gte: start,
                            $lte: end
                        }
                    };
                } else {
                    return res.json({
                        success: false,
                        message: 'Start date and end date are required for custom period'
                    });
                }
                break;

            default:
                return res.json({
                    success: false,
                    message: 'Invalid period specified'
                });
        }

        const baseQuery = {
            ...dateFilter,
            orderStatus: { $ne: 'Cancelled' }
        };



        // Get overall stats
        const result = await Order.aggregate([
            { $match: baseQuery },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$totalAmount' },
                    totalDiscount: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$discountAmount', 0] },
                                { $ifNull: ['$couponDiscount', 0] },
                                0 // Offer discount removed
                            ]
                        }
                    }
                }
            }
        ]);

        const stats = result[0] || { totalOrders: 0, totalRevenue: 0, totalDiscount: 0 };

        // Get detailed orders
        const orders = await Order.find(baseQuery)
            .populate('userId', 'name email')
            .sort({ orderDate: -1 })
            .limit(100);

        const detailedOrders = orders.map(order => ({
            orderId: order.orderId,
            orderDate: order.orderDate,
            customer: order.userId?.name || 'N/A',
            totalAmount: order.totalAmount,
            discountAmount: (order.discountAmount || 0) + (order.couponDiscount || 0),
            paymentMethod: order.paymentMethod,
            itemCount: order.items?.length || 0
        }));



        res.json({
            success: true,
            data: {
                period,
                dateRange: {
                    start: dateFilter.orderDate?.$gte || null,
                    end: dateFilter.orderDate?.$lt || dateFilter.orderDate?.$lte || null
                },
                stats,
                orders: detailedOrders
            }
        });
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.json({ success: false, message: error.message });
    }
};


export default {
    getSalesReportPage,
    getSalesReportData,
    downloadExcelReport,
    downloadPDFReport,
    generateSalesReport
};