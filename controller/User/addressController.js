import Address from '../../model/addressSchema.js';
import User from '../../model/userSchema.js';
import Cart from '../../model/cartSchema.js';



const renderAddressesPage = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get full user data
    const fullUser = await User.findById(userId);
    
    // Get user's cart for header
    const cart = await Cart.findOne({ userId });
    const cartCount = cart ? cart.getTotalItems() : 0;
    
    // Get user addresses
    const addresses = await Address.find({ 
      userId, 
      isActive: true 
    }).sort({ isDefault: -1, createdAt: -1 });

    res.render('user/addresses', {
      title: 'Manage Addresses - Melodia',
      user: fullUser,
      cartCount,
      addresses
    });

  } catch (error) {
    console.error('Render addresses page error:', error);
    res.status(500).send('Error loading addresses page');
  }
};

// Get all addresses for user (API)
const getAddresses = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    const addresses = await Address.find({ 
      userId, 
      isActive: true 
    }).sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      addresses
    });

  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch addresses'
    });
  }
};

// Add new address
const addAddress = async (req, res) => {
  try {
    console.log('Add address request received');
    console.log('Request body:', req.body);
    console.log('User session:', req.session.user);
    
    const userId = req.session.user.id;
    const {
      fullName,
      phoneNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      addressType,
      isDefault
    } = req.body;

    // Validate required fields
    if (!fullName || !phoneNumber || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate phone number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit phone number'
      });
    }

    // Validate pincode
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!pincodeRegex.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
      });
    }

    // Check if this is the first address (make it default)
    const existingAddresses = await Address.countDocuments({ userId, isActive: true });
    const shouldBeDefault = existingAddresses === 0 || isDefault;

    const newAddress = new Address({
      userId,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || '',
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country?.trim() || 'India',
      addressType: addressType || 'Home',
      isDefault: shouldBeDefault
    });

    await newAddress.save();

    console.log('Address saved successfully:', newAddress._id);
    
    res.json({
      success: true,
      message: 'Address added successfully',
      address: newAddress
    });

  } catch (error) {
    console.error('Add address error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add address'
    });
  }
};

// Update address
const updateAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;
    const updateData = req.body;

    // Validate required fields
    if (!updateData.fullName || !updateData.phoneNumber || !updateData.addressLine1 || 
        !updateData.city || !updateData.state || !updateData.pincode) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Validate phone number
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(updateData.phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit phone number'
      });
    }

    // Validate pincode
    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!pincodeRegex.test(updateData.pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 6-digit pincode'
      });
    }

    const address = await Address.findOne({ 
      _id: addressId, 
      userId, 
      isActive: true 
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Update address fields
    Object.keys(updateData).forEach(key => {
      if (key !== 'userId' && key !== '_id') {
        address[key] = updateData[key];
      }
    });

    await address.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      address
    });

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update address'
    });
  }
};

// Delete address (soft delete)
const deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;

    const address = await Address.findOne({ 
      _id: addressId, 
      userId, 
      isActive: true 
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Soft delete
    address.isActive = false;
    await address.save();

    // If this was the default address, set another address as default
    if (address.isDefault) {
      const nextAddress = await Address.findOne({ 
        userId, 
        isActive: true,
        _id: { $ne: addressId }
      });
      
      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete address'
    });
  }
};

// Set default address
const setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const addressId = req.params.id;

    const address = await Address.findOne({ 
      _id: addressId, 
      userId, 
      isActive: true 
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    await address.setAsDefault();

    res.json({
      success: true,
      message: 'Default address updated successfully'
    });

  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set default address'
    });
  }
};

export default {
  renderAddressesPage,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
};