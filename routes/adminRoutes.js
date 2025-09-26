const express= require ('express');
const router =express.Router();
const adminCtrl=require('../controller/Admin/adminController');
const {validateAdminSession,adminAuth}=require('../middleware/adminAuth');


router.get('/login',adminCtrl.getLogin);
router.post('/login',adminCtrl.postLogin);

router.use(validateAdminSession)
//protected routes
router.get('/dashboard',adminAuth,adminCtrl.getDashboard);
router.post('/dashboard',adminAuth,adminCtrl.getDashboard);



router.get('/logout',adminAuth,adminCtrl.logout);



module.exports=router;