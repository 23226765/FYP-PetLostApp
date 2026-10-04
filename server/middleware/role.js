export function requireShelterAdmin(req, res, next) {
  if (req.user?.role !== 'shelter_admin') {
    return res.status(403).json({
      error: 'Shelter administrator access required.',
      code: 'SHELTER_ADMIN_REQUIRED',
    })
  }
  next()
}
