import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { HikvisionIsapiService } from '../../infrastructure/devices/HikvisionIsapiService.js';
import {
  createPersonSchema,
  searchPersonsSchema,
  modifyPersonSchema,
  deletePersonSchema,
} from '../validators/person.schema.js';

const router = Router();

router.use(authenticate);

// POST /persons - Create a person on a Hikvision device
router.post('/',
  rateLimiter,
  validateBody(createPersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, name, userType, valid, doorRight, rightPlan } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.createPerson({
      UserInfo: {
        employeeNo,
        name,
        userType,
        ...(valid && { Valid: valid }),
        ...(doorRight && { doorRight }),
        ...(rightPlan && { RightPlan: rightPlan }),
      },
    });

    res.status(201).json({ data: result });
  })
);

// POST /persons/search - Search persons on a device
router.post('/search',
  rateLimiter,
  validateBody(searchPersonsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList, maxResults, searchResultPosition } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.searchPersons({
      UserInfoSearchCond: {
        searchID: crypto.randomUUID(),
        searchResultPosition,
        maxResults,
        ...(employeeNoList && {
          EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
        }),
      },
    });

    res.json({ data: result });
  })
);

// PUT /persons - Modify a person
router.put('/',
  rateLimiter,
  validateBody(modifyPersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNo, name, userType, valid, doorRight, rightPlan } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.modifyPerson({
      UserInfo: {
        employeeNo,
        ...(name && { name }),
        ...(userType && { userType }),
        ...(valid && { Valid: valid }),
        ...(doorRight && { doorRight }),
        ...(rightPlan && { RightPlan: rightPlan }),
      },
    });

    res.json({ data: result });
  })
);

// PUT /persons/delete - Delete person(s)
router.put('/delete',
  rateLimiter,
  validateBody(deletePersonSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { readerName, employeeNoList } = req.body;

    const isapi = HikvisionIsapiService.forReader(readerName);
    const result = await isapi.deletePerson({
      UserInfoDelCond: {
        EmployeeNoList: employeeNoList.map((no: string) => ({ employeeNo: no })),
      },
    });

    res.json({ data: result });
  })
);

export default router;
