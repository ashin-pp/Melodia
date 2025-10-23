import Category from '../../model/categorySchema.js'; 

export const getCategories = async (req, res) => {
  try {
    const justedited = req.session.categoryEditted ? req.session.categoryEditted : false
    delete req.session.categoryEditted;
    const justAdded = req.session.categoryAdded ? req.session.categoryAdded : false
    delete req.session.categoryAdded;
    console.log(justAdded)
    const query = req.query.q ? req.query.q.trim() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const filter = {};
    if (query) {
      filter.name = { $regex: query, $options: 'i' };
    }

    const totalCategories = await Category.countDocuments(filter);
    const totalPages = Math.ceil(totalCategories / limit);
    
    const categories = await Category.find(filter)
      .sort({ createdAt: -1 }) 
      .skip((page - 1) * limit)
      .limit(limit);

    res.render('admin/category', {
      categories,
      query,
      currentPage: page,
      totalPages,
      justedited,
      justAdded
    });
  } catch (err) {
    console.error(err);
    res.render('error/500', { title: 'Server Error' });
  }
};

export const getAddCategory = async(req,res) => {
   res.render('admin/addcategory',{ errors: [], old: {} }) 
}

export const postAddCategory = async (req, res) => {
  const { name, description, offer, isListed } = req.body;
  let errors = [];

  if (!name || !name.trim()) {
    errors.push("Category name is required.");
  }
  if (offer !== undefined && offer !== '') {
    const offerNum = Number(offer);
    if (isNaN(offerNum) || offerNum < 0 || offerNum > 100) {
      errors.push("Offer must be a number between 0 and 100.");
    }
  }

  // If errors, re-render with old data
  if (errors.length > 0) {
    return res.render('admin/addcategory', {
      errors,
      old: req.body
    });
  }

  try {
    const categoryExists = await Category.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' } 
    });

    if (categoryExists) {
      return res.render('admin/addcategory', {
        errors: ['A category with this name already exists.'],
        old: req.body
      });
    }
    
    const categoryData = {
      name: name.trim(),
      description: description || '',
      offer: offer ? Number(offer) : 0,
      isListed: isListed === 'on' ? true : false
    };
    
    await Category.create(categoryData);
    req.session.categoryAdded = true;

    req.session.save((err) => {
      if (err) {
        console.error('Session save error in category add:', err);
      }
      console.log("session saved")
    });

    res.redirect('/admin/category');
  } catch (error) {
    console.error(error);
    res.render('admin/addcategory', {
      errors: ['Server error, please try again later.'],
      old: req.body,
    });
  }
};

export const getEditCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).render('error/404', { title: 'Category Not Found' });
    }
    res.render('admin/editcategory', { category, errors: [], old: {} });
  } catch (error) {
    console.error(error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

function validateCategoryInput({ name, offer }) {
  let errors = [];
  if (!name || !name.trim()) errors.push("Category name is required.");
  if (offer !== undefined && offer !== '') {
    const offerNum = Number(offer);
    if (isNaN(offerNum) || offerNum < 0 || offerNum > 100)
      errors.push("Offer must be a number between 0 and 100.");
  }
  return errors;
}

// ✅ FIXED: The main problem was here in postEditCategory
export const postEditCategory = async (req, res) => {
  const { name, description, offer, isListed } = req.body;
  const categoryId = req.params.id;

  console.log('🔍 === COMPLETE DEBUG ===');
  console.log('Category ID:', categoryId);
  console.log('Request body:', req.body);
  console.log('isListed raw value:', isListed);
  console.log('isListed type:', typeof isListed);

  const errors = validateCategoryInput({ name, offer });

  if (errors.length > 0) {
    const category = await Category.findById(categoryId);
    return res.render('admin/editcategory', {
      category,
      errors,
      old: req.body
    });
  }

  try {
    // Check for duplicate names (excluding current category)
    const duplicate = await Category.findOne({ 
      name: { $regex: `^${name.trim()}$`, $options: 'i' } ,
      _id: { $ne: categoryId } 
    });
    
    if (duplicate) {
      const category = await Category.findById(categoryId);
      return res.render('admin/editcategory', {
        category,
        errors: ["A category with this name already exists."],
        old: req.body
      });
    }

    // ✅ THE FIX: Proper boolean conversion
    // When checkbox is checked, isListed = 'on'
    // When checkbox is unchecked, isListed = undefined
    const isListedBoolean = isListed === 'on';
    
    console.log('✅ Boolean conversion result:', isListedBoolean);

    const updatedFields = {
      name: name.trim(),
      description: description || '',
      offer: offer ? Number(offer) : 0,
      isListed: isListedBoolean  // ✅ This was the problem - you had: isListed === 'on' which returns true/false, but you need the actual boolean
    };

    console.log('📝 Update fields:', updatedFields);

    // ✅ BETTER UPDATE METHOD: Use updateOne for guaranteed update
    const updateResult = await Category.updateOne(
      { _id: categoryId }, 
      { $set: updatedFields }
    );

    console.log('🔄 Update result:', updateResult);

    // ✅ Verify the update worked
    const updatedCategory = await Category.findById(categoryId);
    console.log('✅ Updated category verification:', {
      id: updatedCategory._id,
      name: updatedCategory.name, 
      isListed: updatedCategory.isListed,
      type: typeof updatedCategory.isListed
    });

    req.session.categoryEditted = true;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in category edit:', err);
      }
      console.log("Session saved successfully");
    });

    return res.redirect('/admin/category');
    
  } catch (error) {
    console.error('❌ Update error:', error);
    const category = await Category.findById(categoryId);
    res.render('admin/editcategory', {
      category,
      errors: ['Server error, please try again later.'],
      old: req.body
    });
  }
};

// ✅ BONUS: Add a toggle route for easier status changes
export const toggleCategoryStatus = async (req, res) => {
  try {
    const categoryId = req.params.id;
    
    console.log('🔄 Toggling status for category:', categoryId);
    
    // Find current category
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Toggle the status
    const newStatus = !category.isListed;
    
    console.log('Current status:', category.isListed, '→ New status:', newStatus);
    
    // Update using updateOne for reliability
    const updateResult = await Category.updateOne(
      { _id: categoryId },
      { $set: { isListed: newStatus } }
    );
    
    console.log('Toggle update result:', updateResult);
    
    // Verify the update
    const updatedCategory = await Category.findById(categoryId);
    console.log('Verified new status:', updatedCategory.isListed);
    
    res.json({
      success: true,
      newStatus: updatedCategory.isListed ? 'Listed' : 'Unlisted',
      message: `Category ${updatedCategory.isListed ? 'listed' : 'unlisted'} successfully`
    });
    
  } catch (error) {
    console.error('❌ Toggle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating category status' 
    });
  }
};
// Default export for compatibility
export default {
  getCategories,
  getAddCategory,
  postAddCategory,
  getEditCategory,
  postEditCategory,
  toggleCategoryStatus
};