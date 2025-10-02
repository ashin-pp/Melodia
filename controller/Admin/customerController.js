const User =require('../../model/userSchema')

exports.getUsers = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : '';
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page, 5) || 1;
    const limit = 5;

    const filter = { role: 'user' };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        
      ];
    }

    if (status === 'blocked') {
      filter.isBlocked = true;
    } else if (status === 'unblock') {
      filter.isBlocked = false;
    }

    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

    const users = await User.find(filter)
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const hasPrevPage = page > 1;
    const hasNextPage = page < totalPages;
    const prevPage = hasPrevPage ? page - 1 : null;
    const nextPage = hasNextPage ? page + 1 : null;
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

    res.render('admin/customer', {
      users,
      search,
      status,
      currentPage: page,
      totalUsers,
      totalPages,
      hasPrevPage,
      hasNextPage,
      prevPage,
      nextPage,
      pageNumbers
    });
  } catch (err) {
    console.error(err);
    res.render('error/500', { title: 'Server Error' });
  }
};

exports.toggleBlockStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    const newStatus = user.isBlocked ? 'Block' : 'Unblock';

    return res.json({
      success: true,
      newStatus,
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
